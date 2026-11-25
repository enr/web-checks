// Runtime-agnostic execution engine.
// - topological sort on dependsOn (§A.4)
// - skip-not-fail: non-applicable checks become `skipped`, never failed (§A.7)
// - check isolation: an unplanned throw becomes an internal-error Finding (§A.7)
// - worst-of aggregation for multi-instance checks (SPEC §"Multi-instance aggregation")
// - multi-mode fusion by check id (§A.5)

import type { AuthRuntime } from '../auth/types.js';
import type { BrowserDriver } from '../browser/driver.js';
import type { InputSource } from '../loaders/input.js';
import type { Finding, Mode } from './check.js';
import type { ResolvedConfig } from './config.js';
import type { Logger } from './logger.js';
import { MODE_PRECEDENCE } from './modes.js';
import { type CheckModule, MapResultBag } from './module.js';

export interface EngineDeps {
  input: InputSource;
  config: ResolvedConfig;
  browser?: BrowserDriver;
  auth?: AuthRuntime;
  log: Logger;
}

/** Deterministic topological sort on dependsOn (edges: dep → dependent). */
export function toposort(modules: readonly CheckModule[]): CheckModule[] {
  const byId = new Map(modules.map((m) => [m.check.id, m]));
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const ordered: CheckModule[] = [];

  const visit = (mod: CheckModule): void => {
    if (visited.has(mod.check.id)) return;
    if (onStack.has(mod.check.id)) {
      // Cycle: break it deterministically rather than crashing.
      return;
    }
    onStack.add(mod.check.id);
    for (const depId of mod.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    onStack.delete(mod.check.id);
    visited.add(mod.check.id);
    ordered.push(mod);
  };

  // Iterate in stable catalog order for determinism.
  for (const mod of modules) visit(mod);
  return ordered;
}

/** Worst-of aggregation: a check fails if any instance fails (SPEC §"Multi-instance aggregation"). */
export function aggregateWorstOf(findings: Finding[]): Finding {
  if (findings.length === 1) return findings[0] as Finding;
  const first = findings[0] as Finding;

  const errors = findings.filter((f) => f.status === 'error');
  const warnings = findings.filter((f) => f.status === 'warning');
  const skipped = findings.filter((f) => f.status === 'skipped');
  const infos = findings.filter((f) => f.status === 'info');

  const failing = errors.length > 0 ? errors : warnings.length > 0 ? warnings : [];
  if (failing.length > 0) {
    const worst = failing[0] as Finding;
    const evidence = failing
      .map((f) => f.evidence)
      .filter((e): e is string => !!e)
      .join('; ');
    return { ...worst, evidence: evidence || worst.evidence };
  }
  if (infos.length > 0) return infos[0] as Finding;
  // No real outcome: all skipped → report as skipped.
  if (skipped.length === findings.length) return first;
  return first;
}

async function runOne(mod: CheckModule, deps: EngineDeps, results: MapResultBag): Promise<Finding> {
  const { check } = mod;
  const { input, config, browser, log } = deps;

  // Disabled via config → skipped (disabled).
  if (config.ignore.includes(check.id)) {
    return {
      check,
      status: 'skipped',
      message: 'Disabled via configuration',
      skipReason: 'disabled',
    };
  }
  // Not applicable to this mode → skipped (mode).
  if (!check.modes.includes(input.mode)) {
    return {
      check,
      status: 'skipped',
      message: 'Not applicable in the current mode',
      skipReason: 'mode',
    };
  }
  // Tier 1/2 without a browser → skipped (no-browser).
  if (check.tier > 0 && !browser) {
    return {
      check,
      status: 'skipped',
      message: 'Requires a browser (Playwright) which is not available',
      skipReason: 'no-browser',
    };
  }

  try {
    const out = await mod.run({ input, config, browser, auth: deps.auth, results, log });
    const list = Array.isArray(out) ? out : [out];
    if (list.length === 0) {
      throw new Error('check produced no finding');
    }
    return aggregateWorstOf(list);
  } catch (err) {
    // A.7 isolation: never crash the whole run for one check.
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    log.error(`[${check.id}] internal error: ${stack}`);
    return {
      check,
      status: 'error',
      message: 'Internal check error',
      fix: 'This is a bug in web-checks, not in the target. Please report it.',
      evidence: stack,
    };
  }
}

/** Run the catalog once for a single mode/target. */
export async function runMode(
  modules: readonly CheckModule[],
  deps: EngineDeps,
): Promise<Finding[]> {
  const ordered = toposort(modules);
  const results = new MapResultBag();
  const findings: Finding[] = [];
  for (const mod of ordered) {
    const finding = await runOne(mod, deps, results);
    results.set(finding);
    findings.push(finding);
  }
  return findings;
}

interface ModeFindings {
  mode: Mode;
  findings: Finding[];
}

/**
 * Fuse per-mode findings by check id (§A.5):
 * 1. drop skipped if a real outcome exists;
 * 2. among real outcomes, keep the highest mode (live > build > source);
 * 3. record the winning mode in evidence.
 */
export function fuseModes(perMode: ModeFindings[]): Finding[] {
  const byId = new Map<string, { mode: Mode; finding: Finding }[]>();
  for (const { mode, findings } of perMode) {
    for (const f of findings) {
      const list = byId.get(f.check.id) ?? [];
      list.push({ mode, finding: f });
      byId.set(f.check.id, list);
    }
  }

  const fused: Finding[] = [];
  for (const candidates of byId.values()) {
    const real = candidates.filter((c) => c.finding.status !== 'skipped');
    const pool = real.length > 0 ? real : candidates;
    pool.sort((a, b) => MODE_PRECEDENCE[b.mode] - MODE_PRECEDENCE[a.mode]);
    const winner = pool[0] as { mode: Mode; finding: Finding };
    const noteMode = perMode.length > 1;
    const finding = noteMode
      ? { ...winner.finding, evidence: appendMode(winner.finding.evidence, winner.mode) }
      : winner.finding;
    fused.push(demoteSourceOutcome(winner.mode, finding));
  }
  return fused;
}

function appendMode(evidence: string | undefined, mode: Mode): string {
  const tag = `mode: ${mode}`;
  return evidence ? `${evidence} (${tag})` : tag;
}

/**
 * Source-mode results are a pre-flight advisory and do NOT concur to the score
 * (SPEC §Modes). A scored (non-Preflight) finding whose winning mode is
 * `source` is demoted to skipped('advisory-preflight'); Preflight SRC-* stay.
 */
function demoteSourceOutcome(mode: Mode, finding: Finding): Finding {
  if (mode !== 'source') return finding;
  if (finding.check.category === 'Preflight') return finding;
  if (finding.status === 'skipped') return finding;
  return {
    check: finding.check,
    status: 'skipped',
    message: 'Source-mode result — advisory pre-flight, excluded from the score',
    skipReason: 'advisory-preflight',
    evidence: finding.evidence,
  };
}

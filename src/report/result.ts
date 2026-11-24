// The complete run data structure — always produced internally; formatters are
// a projection over it (SPEC §Output). Deterministic ordering: sections follow
// CATEGORY_ORDER, findings within a section sort by check id.

import { CATEGORY_ORDER, type Category, type Finding, type Grade } from '../core/check.js';
import type { ResolvedConfig } from '../core/config.js';
import { ADVISORY_PACKS, PACKS, type Pack, packOf } from '../core/packs.js';
import { type ScoreResult, computeScore, gradeAtLeast, hasScorable } from '../core/scoring.js';

export interface OutcomeCounts {
  passed: number;
  warnings: number;
  errors: number;
  skipped: number;
  info: number;
}

/** Why a pack is (in)active in this run. */
export type PackReason =
  | 'default' // active on every run
  | 'detected' // pwa: the target looks like a PWA
  | 'not-detected' // pwa: no manifest found
  | 'selected' // chosen with --pack / `packs`
  | 'not-selected' // left out by --pack / `packs`
  | 'only'; // --only picked checks of this pack (or none)

/** Activation input for one pack, decided before the run. */
export interface PackState {
  pack: Pack;
  active: boolean;
  reason: PackReason;
  /** What detection found or looked for (pwa). */
  evidence?: string;
}

export interface PackResult extends PackState {
  /** All checks of the pack are advisory: never graded. */
  advisory: boolean;
  /** Grade of the pack; absent when inactive, advisory or nothing was scorable. */
  score?: ScoreResult;
}

export interface RunResult {
  targets: { mode: string; target: string; reason?: string }[];
  /** Fused findings, deterministically ordered. */
  findings: Finding[];
  /** Overall grade over the active packs. */
  score: ScoreResult;
  counts: OutcomeCounts;
  /**
   * True when there is no real grade: the run is source-only (non-scored
   * pre-flight) or the selected checks contain nothing scorable.
   */
  advisory: boolean;
  advisoryReason?: 'source-only' | 'no-scored-checks';
  /** Every pack, in canonical order, with its activation and grade. */
  packs: PackResult[];
  /** CI gate outcome (--fail-below-grade): present only when the gate is enabled. */
  gate?: { failBelowGrade: Grade; passed: boolean };
}

const CATEGORY_INDEX = new Map<Category, number>(CATEGORY_ORDER.map((c, i) => [c, i]));

/** Deterministic sort: category order, then check id. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const ci =
      (CATEGORY_INDEX.get(a.check.category) ?? 999) - (CATEGORY_INDEX.get(b.check.category) ?? 999);
    if (ci !== 0) return ci;
    return a.check.id.localeCompare(b.check.id);
  });
}

export function countOutcomes(findings: Finding[]): OutcomeCounts {
  const counts: OutcomeCounts = { passed: 0, warnings: 0, errors: 0, skipped: 0, info: 0 };
  for (const f of findings) {
    switch (f.status) {
      case 'pass':
        counts.passed++;
        break;
      case 'warning':
        counts.warnings++;
        break;
      case 'error':
        counts.errors++;
        break;
      case 'skipped':
        counts.skipped++;
        break;
      case 'info':
        counts.info++;
        break;
    }
  }
  return counts;
}

/** Grade each active, non-advisory pack on its own findings. */
export function buildPackResults(
  findings: Finding[],
  config: ResolvedConfig,
  states: PackState[],
): PackResult[] {
  const byPack = new Map(states.map((s) => [s.pack, s]));
  return PACKS.map((pack) => {
    const state = byPack.get(pack) ?? { pack, active: false, reason: 'not-selected' as const };
    const advisory = ADVISORY_PACKS.has(pack);
    const own = findings.filter((f) => packOf(f.check) === pack);
    const graded = state.active && !advisory && hasScorable(own);
    return {
      ...state,
      advisory,
      ...(graded ? { score: computeScore(own, config) } : {}),
    };
  });
}

/** One-line description of a pack for the text and agent reports. */
export function describePack(p: PackResult): string {
  if (!p.active) {
    switch (p.reason) {
      case 'not-detected':
        return `not active: ${p.evidence ?? 'no web app manifest'} (--pack to force it)`;
      case 'only':
        return 'not active (--only)';
      default:
        return 'not active';
    }
  }
  const how = p.reason === 'detected' && p.evidence ? `, detected: ${p.evidence}` : '';
  if (p.advisory) return `advisory, not graded${how}`;
  if (!p.score) return `no scored outcome${how}`;
  const cap = p.score.cappedByBlocker ? `, capped to F by ${p.score.cappedByBlocker}` : '';
  return `${p.score.grade} (${p.score.score}%)${cap}${how}`;
}

/** Pack states when every pack runs (callers that do not select packs). */
export function allPacksActive(): PackState[] {
  return PACKS.map((pack) => ({ pack, active: true, reason: 'selected' as const }));
}

export function buildRunResult(
  fused: Finding[],
  config: ResolvedConfig,
  targets: RunResult['targets'],
  packStates: PackState[] = allPacksActive(),
): RunResult {
  const findings = sortFindings(fused);
  const sourceOnly = targets.length > 0 && targets.every((t) => t.mode === 'source');
  const advisoryReason = sourceOnly
    ? ('source-only' as const)
    : hasScorable(findings)
      ? undefined
      : ('no-scored-checks' as const);
  const advisory = advisoryReason !== undefined;
  const score = computeScore(findings, config);
  // CI gate (SPEC §Output futuro D2): grade >= threshold. Advisory (source-only)
  // runs have no real grade, so the gate never fails them.
  const threshold = config.failBelowGrade;
  const gate = threshold
    ? { failBelowGrade: threshold, passed: advisory || gradeAtLeast(score.grade, threshold) }
    : undefined;
  return {
    targets,
    findings,
    score,
    counts: countOutcomes(findings),
    advisory,
    ...(advisoryReason ? { advisoryReason } : {}),
    packs: buildPackResults(findings, config, packStates),
    ...(gate ? { gate } : {}),
  };
}

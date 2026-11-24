// poqa-findings/v1 formatter (--format poqa): the common result format of the
// poqa suite, so poqa-live and other consumers read web-checks without a
// dedicated adapter. Contract and JSON Schema live in enr/effective-train
// (docs/poqa-findings.md, docs/schemas/poqa-findings.v1.json); a copy of the
// schema sits in tests/schemas/ and the tests validate against it.

import type { Severity as CheckSeverity, Finding } from '../core/check.js';
import { packOf } from '../core/packs.js';
import { VERSION } from '../version.js';
import type { RunResult } from './result.js';

export const POQA_SCHEMA = 'poqa-findings/v1';

type PoqaStatus = 'pass' | 'warn' | 'fail' | 'error' | 'skipped';
type PoqaSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface PoqaResult {
  check: string;
  fingerprint: string;
  status: PoqaStatus;
  severity?: PoqaSeverity;
  category?: string;
  title?: string;
  message: string;
  hint?: string;
  evidence?: { name: string; observed: string }[];
  skip_reason?: string;
  properties: Record<string, unknown>;
}

/**
 * `info` is not a problem: it maps to `pass`, with the original outcome kept
 * in `properties.outcome`.
 */
function status(f: Finding): PoqaStatus {
  switch (f.status) {
    case 'pass':
    case 'info':
      return 'pass';
    case 'warning':
      return 'warn';
    case 'error':
      return 'fail';
    case 'skipped':
      return 'skipped';
  }
}

/** Blocking checks are `critical`: they cap the grade to F. */
function severity(s: CheckSeverity, blocking: boolean): PoqaSeverity {
  if (blocking) return 'critical';
  switch (s) {
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    case 'info':
      return 'info';
  }
}

function toResult(f: Finding): PoqaResult {
  return {
    check: f.check.id,
    // One fused finding per check: the id is already unique and stable.
    fingerprint: f.check.id,
    status: status(f),
    severity: severity(f.check.severity, Boolean(f.check.blocking)),
    category: packOf(f.check),
    title: f.check.title,
    message: f.message,
    ...(f.fix ? { hint: f.fix } : {}),
    ...(f.evidence ? { evidence: [{ name: 'evidence', observed: f.evidence }] } : {}),
    ...(f.status === 'skipped' ? { skip_reason: f.message } : {}),
    properties: {
      outcome: f.status,
      category: f.check.category,
      tier: f.check.tier,
      ...(f.skipReason ? { skipReason: f.skipReason } : {}),
    },
  };
}

function summarize(results: PoqaResult[]) {
  const by_status = { pass: 0, warn: 0, fail: 0, error: 0, skipped: 0 };
  const by_severity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of results) {
    by_status[r.status]++;
    if ((r.status === 'warn' || r.status === 'fail') && r.severity) by_severity[r.severity]++;
  }
  return { total: results.length, by_status, by_severity };
}

export function formatPoqa(result: RunResult, generatedAt: Date = new Date()): string {
  const results = result.findings.map(toResult);
  const payload = {
    schema: POQA_SCHEMA,
    tool: { name: 'web-checks', version: VERSION },
    generated_at: generatedAt.toISOString(),
    subject: {
      kind: result.targets.some((t) => t.mode === 'live') ? 'web' : 'code',
      targets: result.targets.map((t) => t.target),
    },
    // A run that could not check its target exits 3 without output, so every
    // document written is complete.
    complete: true,
    engines: [],
    summary: summarize(results),
    ...(result.gate
      ? {
          gate: {
            passed: result.gate.passed,
            threshold: `--fail-below-grade ${result.gate.failBelowGrade}`,
          },
        }
      : {}),
    results,
    properties: {
      grade: result.score.grade,
      score: result.score.score,
      advisory: result.advisory,
      packs: result.packs
        .filter((p) => p.active)
        .map((p) => ({
          pack: p.pack,
          advisory: p.advisory,
          ...(p.score ? { grade: p.score.grade, score: p.score.score } : {}),
        })),
    },
  };
  return JSON.stringify(payload, null, 2);
}

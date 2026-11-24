// Machine-readable JSON formatter (--format json, SPEC §Output). A stable
// projection of RunResult for programmatic consumers (CI, dashboards, other
// tools): pretty-printed, deterministic ordering inherited from RunResult,
// never colored. Optional Finding fields are omitted rather than null.

import type { Finding } from '../core/check.js';
import { PACKS, type Pack, packOf } from '../core/packs.js';
import type { ScoreResult } from '../core/scoring.js';
import { VERSION } from '../version.js';
import type { PackResult, RunResult } from './result.js';

/** Bump when a field changes meaning or is removed; adding fields does not bump it. */
export const JSON_SCHEMA_VERSION = 2;

interface JsonFinding {
  id: string;
  category: string;
  pack: Pack;
  title: string;
  tier: number;
  severity: string;
  blocking?: boolean;
  status: string;
  message: string;
  fix?: string;
  evidence?: string;
  skipReason?: string;
}

function toJsonFinding(f: Finding): JsonFinding {
  return {
    id: f.check.id,
    category: f.check.category,
    pack: packOf(f.check),
    title: f.check.title,
    tier: f.check.tier,
    severity: f.check.severity,
    ...(f.check.blocking ? { blocking: true } : {}),
    status: f.status,
    message: f.message,
    ...(f.fix ? { fix: f.fix } : {}),
    ...(f.evidence ? { evidence: f.evidence } : {}),
    ...(f.skipReason ? { skipReason: f.skipReason } : {}),
  };
}

function jsonScore(score: ScoreResult) {
  return {
    score: score.score,
    grade: score.grade,
    ...(score.cappedByBlocker ? { cappedByBlocker: score.cappedByBlocker } : {}),
    categories: score.categories
      .filter((c) => c.ratio !== null)
      .map((c) => ({
        category: c.category,
        ratio: c.ratio,
        weight: c.weight,
      })),
  };
}

function jsonPack(p: PackResult) {
  return {
    pack: p.pack,
    active: p.active,
    reason: p.reason,
    ...(p.evidence ? { evidence: p.evidence } : {}),
    advisory: p.advisory,
    ...(p.score ? { score: jsonScore(p.score) } : {}),
  };
}

export function formatJson(result: RunResult): string {
  const payload = {
    schemaVersion: JSON_SCHEMA_VERSION,
    tool: 'web-checks',
    version: VERSION,
    targets: result.targets,
    /** True when there is no real grade (source-only run, or nothing scorable). */
    advisory: result.advisory,
    ...(result.advisoryReason ? { advisoryReason: result.advisoryReason } : {}),
    score: jsonScore(result.score),
    packs: PACKS.map((name) => result.packs.find((p) => p.pack === name))
      .filter((p): p is PackResult => p !== undefined)
      .map(jsonPack),
    counts: result.counts,
    ...(result.gate ? { gate: result.gate } : {}),
    findings: result.findings.map(toJsonFinding),
  };
  return JSON.stringify(payload, null, 2);
}

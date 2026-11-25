// Factory for snapshot-based RSP-* Tier 1 checks. Reads the shared per-run
// snapshots and reports a single worst-of Finding: pass when no instance
// offends, otherwise the check severity with every failing instance in evidence
// (SPEC §"Multi-instance aggregation" — worst-of).

import type { MeasureSnapshot } from '../../../browser/measure.js';
import type { Check } from '../../../core/check.js';
import { info, pass, warn } from '../../../core/finding.js';
import type { CheckContext, CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getSnapshots, instanceLabel } from './shared.js';

export interface RspSnapshotSpec {
  check: Check;
  /** Message key for the negative outcome. */
  negKey: string;
  /** Return the offending instance labels (empty = pass). */
  offenders(snapshots: MeasureSnapshot[], ctx: CheckContext): string[];
}

export function rspSnapshotCheck(spec: RspSnapshotSpec): CheckModule {
  const { check } = spec;
  return {
    check,
    async run(ctx) {
      const snaps = await getSnapshots(ctx);
      const m = messages[check.id] ?? {};
      if (snaps.length === 0) {
        return pass(check, m.ok, 'no pages measured');
      }
      const bad = spec.offenders(snaps, ctx);
      if (bad.length === 0) {
        return pass(check, m.ok);
      }
      const evidence = bad.join('; ');
      const msg = m[spec.negKey] ?? '';
      const fix = m.fix ?? '';
      return check.severity === 'warning'
        ? warn(check, msg, fix, evidence)
        : info(check, msg, fix, evidence);
    },
  };
}

/** Helper: label instances where a metric array is non-empty. */
export function labelWhereNonEmpty(
  snapshots: MeasureSnapshot[],
  pick: (s: MeasureSnapshot) => { tag: string }[],
  opts?: { mobileOnly?: boolean },
): string[] {
  const out: string[] = [];
  for (const s of snapshots) {
    if (opts?.mobileOnly && s.breakpointClass !== 'mobile') continue;
    const items = pick(s);
    if (items.length > 0) {
      out.push(
        `${instanceLabel(s)} (${items
          .map((i) => i.tag)
          .slice(0, 3)
          .join(', ')})`,
      );
    }
  }
  return out;
}

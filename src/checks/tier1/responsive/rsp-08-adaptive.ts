import { instanceLabel } from './shared.js';
import { rspSnapshotCheck } from './snapshot-check.js';

// RSP-08 (scored): a wide multi-column layout must reflow on mobile. Guard
// against false positives: only fails when a mobile breakpoint keeps multiple
// columns AND overflows (crowding), not when the app is already single-column.
export const rsp08 = rspSnapshotCheck({
  check: {
    id: 'RSP-08',
    category: 'Responsiveness',
    title: 'layout reflows on mobile',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  negKey: 'noReflow',
  offenders: (snaps) =>
    snaps
      .filter((s) => s.breakpointClass === 'mobile' && s.columns > 1 && s.overflowX)
      .map((s) => `${instanceLabel(s)} (${s.columns} columns)`),
});

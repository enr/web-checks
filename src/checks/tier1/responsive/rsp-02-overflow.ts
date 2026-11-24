import { instanceLabel } from './shared.js';
import { rspSnapshotCheck } from './snapshot-check.js';

// RSP-02 (scored): no horizontal overflow at any breakpoint.
export const rsp02 = rspSnapshotCheck({
  check: {
    id: 'RSP-02',
    category: 'Responsiveness',
    title: 'no horizontal overflow',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  negKey: 'overflow',
  offenders: (snaps) =>
    snaps
      .filter((s) => s.overflowX)
      .map((s) => `${instanceLabel(s)} (${s.scrollWidth}>${s.clientWidth})`),
});

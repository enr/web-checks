import { labelWhereNonEmpty, rspSnapshotCheck } from './snapshot-check.js';

// RSP-03 (scored): touch targets >= 44x44 on mobile breakpoints.
export const rsp03 = rspSnapshotCheck({
  check: {
    id: 'RSP-03',
    category: 'Responsiveness',
    title: 'touch targets >= 44x44 on mobile',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  negKey: 'small',
  offenders: (snaps) => labelWhereNonEmpty(snaps, (s) => s.smallTouchTargets, { mobileOnly: true }),
});

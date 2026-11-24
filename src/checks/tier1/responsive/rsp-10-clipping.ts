import { labelWhereNonEmpty, rspSnapshotCheck } from './snapshot-check.js';

// RSP-10 (advisory): no unintended text clipping.
export const rsp10 = rspSnapshotCheck({
  check: {
    id: 'RSP-10',
    category: 'Responsiveness',
    title: 'no unintended text clipping',
    modes: ['live'],
    tier: 1,
    severity: 'info',
    deterministic: true,
  },
  negKey: 'clipped',
  offenders: (snaps) => labelWhereNonEmpty(snaps, (s) => s.clipped),
});

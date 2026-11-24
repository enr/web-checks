import { labelWhereNonEmpty, rspSnapshotCheck } from './snapshot-check.js';

// RSP-09 (advisory): no undue overlap between elements.
export const rsp09 = rspSnapshotCheck({
  check: {
    id: 'RSP-09',
    category: 'Responsiveness',
    title: 'no undue element overlap',
    modes: ['live'],
    tier: 1,
    severity: 'info',
    deterministic: true,
  },
  negKey: 'overlap',
  offenders: (snaps) => labelWhereNonEmpty(snaps, (s) => s.overlaps),
});

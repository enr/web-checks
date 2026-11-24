import { labelWhereNonEmpty, rspSnapshotCheck } from './snapshot-check.js';

// RSP-07 (scored): images and media scale with their container.
export const rsp07 = rspSnapshotCheck({
  check: {
    id: 'RSP-07',
    category: 'Responsiveness',
    title: 'media scales with container',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  negKey: 'overflow',
  offenders: (snaps) => labelWhereNonEmpty(snaps, (s) => s.mediaOverflow),
});

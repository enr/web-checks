import { labelWhereNonEmpty, rspSnapshotCheck } from './snapshot-check.js';

// RSP-04 (advisory): no text below the minimum readable size.
export const rsp04 = rspSnapshotCheck({
  check: {
    id: 'RSP-04',
    category: 'Responsiveness',
    title: 'no text below minimum size',
    modes: ['live'],
    tier: 1,
    severity: 'info',
    deterministic: true,
  },
  negKey: 'small',
  offenders: (snaps) => labelWhereNonEmpty(snaps, (s) => s.smallFonts),
});

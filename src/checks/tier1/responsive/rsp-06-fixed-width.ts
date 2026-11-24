import { labelWhereNonEmpty, rspSnapshotCheck } from './snapshot-check.js';

// RSP-06 (advisory): no fixed-width element exceeds the viewport.
export const rsp06 = rspSnapshotCheck({
  check: {
    id: 'RSP-06',
    category: 'Responsiveness',
    title: 'no fixed-width element exceeds viewport',
    modes: ['live'],
    tier: 1,
    severity: 'info',
    deterministic: true,
  },
  negKey: 'wide',
  offenders: (snaps) => labelWhereNonEmpty(snaps, (s) => s.fixedWideElements),
});

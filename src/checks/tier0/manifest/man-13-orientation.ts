import { isNonEmptyString, manifestField } from './field.js';

export const man13 = manifestField({
  check: {
    id: 'MAN-13',
    category: 'Manifest',
    title: 'orientation present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.orientation),
});

import { isNonEmptyString, manifestField } from './field.js';

export const man11 = manifestField({
  check: {
    id: 'MAN-11',
    category: 'Manifest',
    title: 'description is present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.description),
});

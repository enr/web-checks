import { isNonEmptyString, manifestField } from './field.js';

export const man12 = manifestField({
  check: {
    id: 'MAN-12',
    category: 'Manifest',
    title: 'lang / dir present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.lang),
});

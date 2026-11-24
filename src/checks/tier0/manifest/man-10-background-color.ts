import { isNonEmptyString, manifestField } from './field.js';

export const man10 = manifestField({
  check: {
    id: 'MAN-10',
    category: 'Manifest',
    title: 'background_color is present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.background_color),
});

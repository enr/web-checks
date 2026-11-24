import { isNonEmptyString, manifestField } from './field.js';

export const man09 = manifestField({
  check: {
    id: 'MAN-09',
    category: 'Manifest',
    title: 'theme_color is present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.theme_color),
});

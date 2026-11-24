import { isNonEmptyString, manifestField } from './field.js';

export const man15 = manifestField({
  check: {
    id: 'MAN-15',
    category: 'Manifest',
    title: 'id present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.id),
});

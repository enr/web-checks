import { isNonEmptyString, manifestField } from './field.js';

export const man03 = manifestField({
  check: {
    id: 'MAN-03',
    category: 'Manifest',
    title: 'name is present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.name),
  evidence: (j) => (isNonEmptyString(j.name) ? `name=${j.name as string}` : undefined),
});

import { manifestField } from './field.js';

export const man14 = manifestField({
  check: {
    id: 'MAN-14',
    category: 'Manifest',
    title: 'categories present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  present: (j) => Array.isArray(j.categories) && j.categories.length > 0,
});

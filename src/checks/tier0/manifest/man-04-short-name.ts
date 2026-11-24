import { isNonEmptyString, manifestField } from './field.js';

export const man04 = manifestField({
  check: {
    id: 'MAN-04',
    category: 'Manifest',
    title: 'short_name is present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  present: (j) => isNonEmptyString(j.short_name),
  evidence: (j) => {
    if (!isNonEmptyString(j.short_name)) return undefined;
    const s = j.short_name as string;
    return s.length > 12 ? `short_name=${s} (>12 chars, recommended ≤12)` : `short_name=${s}`;
  },
});

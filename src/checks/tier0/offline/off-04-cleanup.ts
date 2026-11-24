import { swFeature } from '../sw/feature.js';

// OFF-04: old caches cleaned up in activate (advisory).
export const off04 = swFeature({
  check: {
    id: 'OFF-04',
    category: 'Offline',
    title: 'cleanup of stale caches in activate',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.cleansOldCaches,
});

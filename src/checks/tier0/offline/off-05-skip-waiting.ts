import { swFeature } from '../sw/feature.js';

// OFF-05: skipWaiting present (advisory).
export const off05 = swFeature({
  check: {
    id: 'OFF-05',
    category: 'Offline',
    title: 'skipWaiting present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.skipWaiting,
});

import { swFeature } from './feature.js';

export const sw07 = swFeature({
  check: {
    id: 'SW-07',
    category: 'ServiceWorker',
    title: 'offline strategy detected',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.strategy !== undefined,
  evidence: (a) => a.strategy,
});

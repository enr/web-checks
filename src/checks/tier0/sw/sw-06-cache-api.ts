import { swFeature } from './feature.js';

export const sw06 = swFeature({
  check: {
    id: 'SW-06',
    category: 'ServiceWorker',
    title: 'Cache API used',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.usesCacheApi,
});

import { swFeature } from './feature.js';

export const sw03 = swFeature({
  check: {
    id: 'SW-03',
    category: 'ServiceWorker',
    title: 'install event handled',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  satisfied: (a) => a.events.has('install'),
});

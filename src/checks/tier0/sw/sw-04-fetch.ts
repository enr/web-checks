import { swFeature } from './feature.js';

export const sw04 = swFeature({
  check: {
    id: 'SW-04',
    category: 'ServiceWorker',
    title: 'fetch event handled',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  satisfied: (a) => a.events.has('fetch'),
});

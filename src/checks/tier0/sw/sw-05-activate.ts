import { swFeature } from './feature.js';

export const sw05 = swFeature({
  check: {
    id: 'SW-05',
    category: 'ServiceWorker',
    title: 'activate event handled',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.events.has('activate'),
});

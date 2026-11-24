import { swFeature } from '../sw/feature.js';

// OFF-06: clients.claim() present (advisory).
export const off06 = swFeature({
  check: {
    id: 'OFF-06',
    category: 'Offline',
    title: 'clients.claim() present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.clientsClaim,
});

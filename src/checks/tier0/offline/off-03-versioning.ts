import { swFeature } from '../sw/feature.js';

const isVersioned = (name: string): boolean => /v\d|[-_.]\d|[0-9a-f]{6,}/i.test(name);

// OFF-03: cache name carries a version/hash (advisory). Workbox precache is
// revisioned by construction.
export const off03 = swFeature({
  check: {
    id: 'OFF-03',
    category: 'Offline',
    title: 'cache versioning',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  satisfied: (a) => a.cacheNames.some(isVersioned),
  evidence: (a) => a.cacheNames.filter(isVersioned).join(', ') || undefined,
});

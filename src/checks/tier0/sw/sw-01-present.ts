import { fail, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadServiceWorker } from './shared.js';

// SW-01: a Service Worker file is present (registration arg or conventional
// path). Blocking. Runtime discovery (getRegistrations) is Tier 1.
export const sw01: CheckModule = {
  check: {
    id: 'SW-01',
    category: 'ServiceWorker',
    title: 'Service Worker file present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    blocking: true,
    deterministic: true,
  },
  async run(ctx) {
    const sw = await loadServiceWorker(ctx);
    if (sw.found) return pass(this.check, messages['SW-01']?.ok, sw.path);
    return fail(this.check, messages['SW-01']?.missing ?? '', messages['SW-01']?.fix ?? '');
  },
};

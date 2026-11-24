import { fail, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadServiceWorker } from './shared.js';

// SW-02: navigator.serviceWorker.register(...) is present in the bundle.
export const sw02: CheckModule = {
  check: {
    id: 'SW-02',
    category: 'ServiceWorker',
    title: 'Service Worker registration in the bundle',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  async run(ctx) {
    const sw = await loadServiceWorker(ctx);
    if (sw.registered) {
      return pass(this.check, messages['SW-02']?.ok, sw.registrationArg);
    }
    return fail(this.check, messages['SW-02']?.missing ?? '', messages['SW-02']?.fix ?? '');
  },
};

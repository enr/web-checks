import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getSwRuntime } from './shared.js';

// SW-08 (live): the Service Worker actually registers and activates at runtime.
export const sw08: CheckModule = {
  check: {
    id: 'SW-08',
    category: 'ServiceWorker',
    title: 'SW registered and activated at runtime',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['SW-08'] ?? {};
    const rt = await getSwRuntime(ctx);
    if (rt.active) return pass(this.check, m.ok, rt.scope ?? undefined);
    return warn(this.check, m.missing ?? '', m.fix ?? '');
  },
};

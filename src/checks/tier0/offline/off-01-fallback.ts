import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadServiceWorker } from '../sw/shared.js';

// OFF-01: an offline fallback exists (offline.html file or a fallback route
// referenced in the SW). Warning.
export const off01: CheckModule = {
  check: {
    id: 'OFF-01',
    category: 'Offline',
    title: 'offline fallback present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['SW-01'],
  async run(ctx) {
    if (!ctx.results.passed('SW-01')) return skip(this.check, 'dependency');
    const m = messages['OFF-01'] ?? {};
    const hasFile =
      (await ctx.input.exists('/offline.html')) || (await ctx.input.exists('/offline/index.html'));
    const sw = await loadServiceWorker(ctx);
    const referenced = /offline/i.test(sw.raw ?? '');
    if (hasFile || referenced) {
      return pass(this.check, m.ok, hasFile ? '/offline.html' : 'referenced in SW');
    }
    return warn(this.check, m.missing ?? '', m.fix ?? '');
  },
};

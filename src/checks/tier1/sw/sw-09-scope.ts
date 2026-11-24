import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from '../../tier0/manifest/shared.js';
import { getSwRuntime } from './shared.js';

// SW-09 (live): the SW scope covers the manifest scope.
export const sw09: CheckModule = {
  check: {
    id: 'SW-09',
    category: 'ServiceWorker',
    title: 'SW scope covers manifest scope',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['SW-08'],
  async run(ctx) {
    const m = messages['SW-09'] ?? {};
    const rt = await getSwRuntime(ctx);
    if (!rt.active || !rt.scope) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const manifestScope = typeof json?.scope === 'string' ? json.scope : '/';
    try {
      const swScopePath = new URL(rt.scope).pathname;
      const appScopePath = new URL(manifestScope, ctx.input.baseUrl).pathname;
      if (appScopePath.startsWith(swScopePath)) {
        return pass(this.check, m.ok, `sw=${swScopePath} app=${appScopePath}`);
      }
      return warn(
        this.check,
        m.mismatch ?? '',
        m.fix ?? '',
        `sw=${swScopePath} app=${appScopePath}`,
      );
    } catch {
      return pass(this.check, m.ok);
    }
  },
};

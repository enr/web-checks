import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { isNonEmptyString } from './field.js';
import { loadManifest } from './shared.js';

// MAN-08: scope present and consistent with start_url (warning).
export const man08: CheckModule = {
  check: {
    id: 'MAN-08',
    category: 'Manifest',
    title: 'scope present and consistent with start_url',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['MAN-01', 'MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const msg = messages['MAN-08'] ?? {};
    if (!isNonEmptyString(json?.scope)) {
      return warn(this.check, msg.missing ?? '', msg.fix ?? '');
    }
    const scope = json?.scope as string;
    const startUrl = typeof json?.start_url === 'string' ? json.start_url : '/';
    try {
      const scopeUrl = new URL(scope, 'http://localhost/');
      const startResolved = new URL(startUrl, 'http://localhost/');
      if (!startResolved.pathname.startsWith(scopeUrl.pathname)) {
        return warn(
          this.check,
          msg.mismatch ?? '',
          msg.fix ?? '',
          `start_url=${startUrl} scope=${scope}`,
        );
      }
    } catch {
      // Malformed URLs are covered by MAN-02/MAN-05; treat as consistent here.
    }
    return pass(this.check, msg.ok, `scope=${scope}`);
  },
};

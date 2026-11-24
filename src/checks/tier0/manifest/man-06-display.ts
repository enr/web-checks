import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from './shared.js';

const INSTALLABLE = new Set(['standalone', 'fullscreen', 'minimal-ui']);

// MAN-06: display present and installable; "browser" is flagged.
export const man06: CheckModule = {
  check: {
    id: 'MAN-06',
    category: 'Manifest',
    title: 'display present and installable',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  dependsOn: ['MAN-01', 'MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const msg = messages['MAN-06'] ?? {};
    const display = json?.display;
    if (typeof display !== 'string' || display.length === 0) {
      return fail(this.check, msg.missing ?? '', msg.fix ?? '');
    }
    if (display === 'browser') {
      return fail(this.check, msg.browser ?? '', msg.fix ?? '', `display=${display}`);
    }
    if (!INSTALLABLE.has(display)) {
      return fail(this.check, msg.browser ?? '', msg.fix ?? '', `display=${display}`);
    }
    return pass(this.check, msg.ok, `display=${display}`);
  },
};

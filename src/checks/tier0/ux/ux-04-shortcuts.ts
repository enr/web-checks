import { info, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from '../manifest/shared.js';

// UX-04: shortcuts declared in the manifest.
export const ux04: CheckModule = {
  check: {
    id: 'UX-04',
    category: 'UX',
    title: 'shortcuts declared',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  dependsOn: ['MAN-02'],
  async run(ctx) {
    const m = messages['UX-04'] ?? {};
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    if (Array.isArray(json?.shortcuts) && json.shortcuts.length > 0) {
      return pass(this.check, m.ok, `${json.shortcuts.length} shortcut(s)`);
    }
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

import { info, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from '../manifest/shared.js';

const INSTALLABLE = new Set(['standalone', 'fullscreen', 'minimal-ui']);

// UX-02: display is installable (no browser dead-end).
export const ux02: CheckModule = {
  check: {
    id: 'UX-02',
    category: 'UX',
    title: 'display installable (no dead-end)',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  dependsOn: ['MAN-02'],
  async run(ctx) {
    const m = messages['UX-02'] ?? {};
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const display = typeof json?.display === 'string' ? json.display : '';
    if (INSTALLABLE.has(display)) return pass(this.check, m.ok, `display=${display}`);
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

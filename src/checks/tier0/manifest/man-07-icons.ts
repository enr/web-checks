import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest, manifestIcons } from './shared.js';

// MAN-07: icons array present and well-formed (each entry has src + sizes).
// Blocking — no icons means not installable.
export const man07: CheckModule = {
  check: {
    id: 'MAN-07',
    category: 'Manifest',
    title: 'icons present and well-formed',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    blocking: true,
    deterministic: true,
  },
  dependsOn: ['MAN-01', 'MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const msg = messages['MAN-07'] ?? {};
    const icons = manifestIcons(json);
    if (icons.length === 0) {
      return fail(this.check, msg.missing ?? '', msg.fix ?? '');
    }
    const wellFormed = icons.every(
      (ic) => typeof ic.src === 'string' && ic.src.length > 0 && typeof ic.sizes === 'string',
    );
    if (!wellFormed) {
      return fail(this.check, msg.malformed ?? '', msg.fix ?? '');
    }
    return pass(this.check, msg.ok, `${icons.length} icon(s)`);
  },
};

import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from './shared.js';

// MAN-02: valid UTF-8 + valid JSON + no duplicate keys. Blocking. MAN-03..15
// dependsOn this so an invalid manifest yields one error, not 14 cascading ones.
export const man02: CheckModule = {
  check: {
    id: 'MAN-02',
    category: 'Manifest',
    title: 'Manifest is valid JSON / UTF-8 / no duplicate keys',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    blocking: true,
    deterministic: true,
  },
  dependsOn: ['MAN-01'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-01')) return skip(this.check, 'dependency');
    const m = await loadManifest(ctx);
    const msg = messages['MAN-02'] ?? {};
    if (!m.utf8.ok) {
      return fail(this.check, msg.invalidUtf8 ?? '', msg.fix ?? '', m.utf8.note);
    }
    if (m.parseError) {
      return fail(this.check, msg.invalidJson ?? '', msg.fix ?? '', m.parseError);
    }
    if (m.duplicateKeys.length > 0) {
      return fail(this.check, msg.duplicateKeys ?? '', msg.fix ?? '', m.duplicateKeys.join(', '));
    }
    return pass(this.check, msg.ok, m.utf8.note);
  },
};

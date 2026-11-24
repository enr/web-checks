import { fail, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from './shared.js';

// MAN-01 verifies the manifest FILE exists (linked or at a conventional path).
// Tag presence is HTML-01 (SPEC §1 anti-double-count). Blocking.
export const man01: CheckModule = {
  check: {
    id: 'MAN-01',
    category: 'Manifest',
    title: 'Manifest present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    blocking: true,
    deterministic: true,
  },
  async run(ctx) {
    const m = await loadManifest(ctx);
    if (m.found) {
      const key = !m.linked ? 'okConventional' : 'ok';
      return pass(this.check, messages['MAN-01']?.[key], m.path ?? undefined);
    }
    return fail(this.check, messages['MAN-01']?.missing ?? '', messages['MAN-01']?.fix ?? '');
  },
};

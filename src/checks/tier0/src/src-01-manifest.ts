import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { findStaticManifest } from './shared.js';

// SRC-01: manifest present as a static file (public/, static/, root). Advisory
// pre-flight smoke check — source outcomes do not affect the score.
export const src01: CheckModule = {
  check: {
    id: 'SRC-01',
    category: 'Preflight',
    title: 'manifest present as a static file',
    modes: ['source'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['SRC-01'] ?? {};
    const found = await findStaticManifest(ctx.input);
    if (found) return pass(this.check, m.ok, found);
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { findPwaPlugin, findStaticSw } from './shared.js';

// SRC-02: SW present as a static file OR a PWA plugin declared in package.json.
// Replaces SW-01/SW-02 in source mode (SPEC §Modalità). Advisory.
export const src02: CheckModule = {
  check: {
    id: 'SRC-02',
    category: 'Preflight',
    title: 'Service Worker present (static file or PWA plugin)',
    modes: ['source'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['SRC-02'] ?? {};
    const sw = await findStaticSw(ctx.input);
    if (sw) return pass(this.check, m.ok, sw);
    const plugin = await findPwaPlugin(ctx.input);
    if (plugin) return pass(this.check, m.ok, `plugin: ${plugin}`);
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

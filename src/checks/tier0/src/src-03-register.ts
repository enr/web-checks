import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { findRegisterCall } from './shared.js';

// SRC-03: a navigator.serviceWorker.register(...) call exists somewhere in the
// source. Replaces SW-02 in source mode (SPEC §Modalità). Advisory.
export const src03: CheckModule = {
  check: {
    id: 'SRC-03',
    category: 'Preflight',
    title: 'serviceWorker.register(...) in source',
    modes: ['source'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['SRC-03'] ?? {};
    const found = await findRegisterCall(ctx.input);
    if (found) return pass(this.check, m.ok, found);
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

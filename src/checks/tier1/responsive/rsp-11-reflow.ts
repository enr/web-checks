import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getReflow } from './shared.js';

// RSP-11 (scored): WCAG 1.4.10 Reflow at 320 CSS px equivalent (400% zoom).
export const rsp11: CheckModule = {
  check: {
    id: 'RSP-11',
    category: 'Responsiveness',
    title: 'WCAG 1.4.10 reflow at 320 CSS px',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RSP-11'] ?? {};
    const results = await getReflow(ctx);
    if (results.length === 0) return pass(this.check, m.ok, 'no pages measured');
    const bad = results.filter((r) => r.horizontalScroll);
    if (bad.length === 0) return pass(this.check, m.ok);
    return warn(
      this.check,
      m.fails ?? '',
      m.fix ?? '',
      bad.map((r) => `${r.route} (${r.detail})`).join('; '),
    );
  },
};

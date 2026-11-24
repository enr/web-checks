import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { metaByName, parseHead } from '../html/shared.js';

// RSP-01 (Tier 0): viewport meta must not disable zoom (accessibility).
export const rsp01: CheckModule = {
  check: {
    id: 'RSP-01',
    category: 'Responsiveness',
    title: 'viewport meta allows zoom',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RSP-01'] ?? {};
    const head = await parseHead(ctx);
    const meta = metaByName(head, 'viewport');
    if (!meta?.content) {
      return warn(this.check, m.missing ?? '', m.fix ?? '');
    }
    const content = meta.content.toLowerCase();
    if (
      /user-scalable\s*=\s*(no|0)/.test(content) ||
      /maximum-scale\s*=\s*1(\.0)?\b/.test(content)
    ) {
      return warn(this.check, m.zoomBlocked ?? '', m.fix ?? '', `content="${meta.content}"`);
    }
    return pass(this.check, m.ok);
  },
};

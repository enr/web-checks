import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

// RSP-05 (Tier 0): adaptive CSS present (@media queries in linked or inline CSS).
export const rsp05: CheckModule = {
  check: {
    id: 'RSP-05',
    category: 'Responsiveness',
    title: 'media queries / adaptive CSS',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RSP-05'] ?? {};
    const head = await parseHead(ctx);
    if (/@media\b/.test(head.raw)) {
      return pass(this.check, m.ok, 'inline @media');
    }
    for (const href of head.stylesheets) {
      const asset = await ctx.input.read(href);
      if (asset && /@media\b/.test(asset.bytes.toString('utf8'))) {
        return pass(this.check, m.ok, href);
      }
    }
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

const SYSTEM_FONT = /system-ui|-apple-system|BlinkMacSystemFont|Segoe UI/i;

// UX-03: system font stack suggested (perceived performance / native feel).
export const ux03: CheckModule = {
  check: {
    id: 'UX-03',
    category: 'UX',
    title: 'system font used',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['UX-03'] ?? {};
    const head = await parseHead(ctx);
    if (SYSTEM_FONT.test(head.raw)) return pass(this.check, m.ok, 'inline CSS');
    for (const href of head.stylesheets) {
      const asset = await ctx.input.read(href);
      if (asset && SYSTEM_FONT.test(asset.bytes.toString('utf8')))
        return pass(this.check, m.ok, href);
    }
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

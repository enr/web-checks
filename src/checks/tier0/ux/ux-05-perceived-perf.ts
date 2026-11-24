import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

// UX-05: perceived-performance hints (skeleton / preload / lazy-loading).
export const ux05: CheckModule = {
  check: {
    id: 'UX-05',
    category: 'UX',
    title: 'perceived-performance hints',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['UX-05'] ?? {};
    const head = await parseHead(ctx);
    const hasPreload = head.links.some((l) => /preload|preconnect/.test(l.rel));
    const hasLazy = head.imgTags.some((i) => i.loading === 'lazy');
    const hasSkeleton = /skeleton|placeholder|shimmer/i.test(head.raw);
    if (hasPreload || hasLazy || hasSkeleton) {
      return pass(this.check, m.ok);
    }
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

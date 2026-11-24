import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

const MODERN = /\.(webp|avif)(\?|#|$)/i;

// PERF-03: images use loading="lazy" and/or modern formats (advisory).
export const perf03: CheckModule = {
  check: {
    id: 'PERF-03',
    category: 'Performance',
    title: 'images lazy-loaded / modern formats',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['PERF-03'] ?? {};
    const head = await parseHead(ctx);
    if (head.imgTags.length === 0) {
      return pass(this.check, m.ok, 'no <img> tags');
    }
    const suboptimal = head.imgTags.filter(
      (img) => img.loading !== 'lazy' && !MODERN.test(img.src ?? ''),
    );
    if (suboptimal.length === 0) {
      return pass(this.check, m.ok);
    }
    return info(
      this.check,
      m.missing ?? '',
      m.fix ?? '',
      suboptimal.map((i) => i.src ?? '?').join(', '),
    );
  },
};

import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

// PERF-04: preconnect/preload hints for critical resources (advisory).
export const perf04: CheckModule = {
  check: {
    id: 'PERF-04',
    category: 'Performance',
    title: 'preconnect/preload hints',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['PERF-04'] ?? {};
    const head = await parseHead(ctx);
    const hints = head.links.filter((l) => {
      const rels = l.rel.split(/\s+/);
      return (
        rels.includes('preconnect') || rels.includes('preload') || rels.includes('modulepreload')
      );
    });
    if (hints.length > 0) {
      return pass(this.check, m.ok, `${hints.length} hint(s)`);
    }
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

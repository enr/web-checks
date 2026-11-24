import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

const HASHED = /[.-][0-9a-f]{8,}\.(js|css|woff2?)/i;

// PERF-06: static assets carry a content hash in the filename (advisory, build).
export const perf06: CheckModule = {
  check: {
    id: 'PERF-06',
    category: 'Performance',
    title: 'content-hashed static assets',
    modes: ['build'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['PERF-06'] ?? {};
    const head = await parseHead(ctx);
    const refs = [...head.scripts, ...head.stylesheets];
    if (refs.length === 0) {
      return pass(this.check, m.ok, 'no local JS/CSS to hash');
    }
    const unhashed = refs.filter((r) => !HASHED.test(r));
    if (unhashed.length === 0) {
      return pass(this.check, m.ok);
    }
    return info(this.check, m.missing ?? '', m.fix ?? '', unhashed.join(', '));
  },
};

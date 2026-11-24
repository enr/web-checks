import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

// PERF-05: no source maps served in production (advisory).
export const perf05: CheckModule = {
  check: {
    id: 'PERF-05',
    category: 'Performance',
    title: 'no source maps in production',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['PERF-05'] ?? {};
    const head = await parseHead(ctx);
    const served: string[] = [];
    for (const src of head.scripts) {
      const asset = await ctx.input.read(src);
      if (!asset) continue;
      const text = asset.bytes.toString('utf8');
      if (/# sourceMappingURL=/.test(text)) served.push(src);
      else if (await ctx.input.exists(`${src}.map`)) served.push(`${src}.map`);
    }
    if (served.length === 0) {
      return pass(this.check, m.ok);
    }
    return info(this.check, m.served ?? '', m.fix ?? '', served.join(', '));
  },
};

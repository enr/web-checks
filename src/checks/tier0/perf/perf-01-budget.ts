import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

// PERF-01: total initial JS+CSS weight (as served, pre-compression) referenced
// from the entry HTML, against config.perf.initialBudgetKb (advisory).
export const perf01: CheckModule = {
  check: {
    id: 'PERF-01',
    category: 'Performance',
    title: 'initial JS/CSS weight within budget',
    modes: ['build'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['PERF-01'] ?? {};
    const head = await parseHead(ctx);
    const refs = [...head.scripts, ...head.stylesheets];
    let total = 0;
    for (const ref of refs) {
      const asset = await ctx.input.read(ref);
      if (asset) total += asset.bytes.length;
    }
    const kb = Math.round(total / 1024);
    const budget = ctx.config.perf.initialBudgetKb;
    const evidence = `${kb}KB of ${budget}KB budget (pre-compression)`;
    if (kb <= budget) {
      return pass(this.check, m.ok, evidence);
    }
    return info(this.check, m.over ?? '', m.fix ?? '', evidence);
  },
};

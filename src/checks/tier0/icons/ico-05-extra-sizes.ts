import { info, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { resolveIcons } from './shared.js';

const RECOMMENDED = [48, 72, 96, 128, 256];

// ICO-05: additional recommended sizes present (advisory info).
export const ico05: CheckModule = {
  check: {
    id: 'ICO-05',
    category: 'Icons',
    title: 'additional recommended icon sizes',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  dependsOn: ['MAN-07'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-07')) return skip(this.check, 'dependency');
    const m = messages['ICO-05'] ?? {};
    const icons = await resolveIcons(ctx);
    const present = new Set<number>();
    for (const r of icons) {
      for (const s of r.declaredSizes) {
        if (s.width === s.height) present.add(s.width);
      }
    }
    const found = RECOMMENDED.filter((d) => present.has(d));
    if (found.length > 0) {
      return pass(this.check, m.ok, `sizes: ${found.join(', ')}`);
    }
    return info(this.check, m.missing ?? '', m.fix ?? '');
  },
};

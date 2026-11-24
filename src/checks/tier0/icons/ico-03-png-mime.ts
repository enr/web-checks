import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { resolveIcons } from './shared.js';

// ICO-03: manifest icons are PNG with the correct MIME type.
export const ico03: CheckModule = {
  check: {
    id: 'ICO-03',
    category: 'Icons',
    title: 'icons are PNG with correct MIME type',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['MAN-07'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-07')) return skip(this.check, 'dependency');
    const m = messages['ICO-03'] ?? {};
    const icons = await resolveIcons(ctx);
    const nonPng = icons.filter((r) => !r.isPng);
    if (nonPng.length > 0) {
      return warn(
        this.check,
        m.notPng ?? '',
        m.fix ?? '',
        nonPng.map((r) => r.icon.src ?? '?').join(', '),
      );
    }
    return pass(this.check, m.ok);
  },
};

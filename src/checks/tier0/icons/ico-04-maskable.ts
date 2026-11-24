import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { resolveIcons } from './shared.js';

// ICO-04: at least one icon with purpose "maskable". Available in source too.
export const ico04: CheckModule = {
  check: {
    id: 'ICO-04',
    category: 'Icons',
    title: 'at least one maskable icon',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const m = messages['ICO-04'] ?? {};
    const icons = await resolveIcons(ctx);
    if (icons.some((r) => r.purposes.has('maskable'))) {
      return pass(this.check, m.ok);
    }
    return warn(this.check, m.missing ?? '', m.fix ?? '');
  },
};

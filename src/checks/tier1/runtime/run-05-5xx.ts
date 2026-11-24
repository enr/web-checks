import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getRuntimeReport } from './shared.js';

// RUN-05 (advisory): no 5xx responses on same-origin requests.
export const run05: CheckModule = {
  check: {
    id: 'RUN-05',
    category: 'RuntimeHealth',
    title: 'no 5xx on same-origin',
    modes: ['live'],
    tier: 1,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RUN-05'] ?? {};
    const report = await getRuntimeReport(ctx);
    const advisory = new Set(ctx.config.runtime.advisoryStatus);
    const offenders = report.network.filter((n) => n.sameOrigin && advisory.has(n.status));
    if (offenders.length > 0) {
      return info(
        this.check,
        m.failed ?? '',
        m.fix ?? '',
        offenders.map((o) => `${o.status} ${o.url}`).join('; '),
      );
    }
    return pass(this.check, m.ok);
  },
};

import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getRuntimeReport } from './shared.js';

// RUN-04 (advisory): no unhandled console/page errors on first load (generic).
export const run04: CheckModule = {
  check: {
    id: 'RUN-04',
    category: 'RuntimeHealth',
    title: 'no unhandled console errors on first load',
    modes: ['live'],
    tier: 1,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RUN-04'] ?? {};
    const report = await getRuntimeReport(ctx);
    const offenders = [...report.consoleErrors.map((e) => e.text), ...report.pageErrors];
    if (offenders.length > 0) {
      return info(this.check, m.failed ?? '', m.fix ?? '', offenders.slice(0, 5).join('; '));
    }
    return pass(this.check, m.ok);
  },
};

import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getRuntimeReport, isPwaRelated } from './shared.js';

const PWA_ERROR = /(service-?worker|serviceworker|\bsw\b|manifest|workbox)/i;

// RUN-03 (scored): no console/page errors related to SW registration or the
// manifest fetch (SPEC §8, absorbs the PWA-critical part of the old INST-04).
export const run03: CheckModule = {
  check: {
    id: 'RUN-03',
    category: 'RuntimeHealth',
    title: 'no SW/manifest console errors',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RUN-03'] ?? {};
    const report = await getRuntimeReport(ctx);
    const offenders = [
      ...report.consoleErrors.filter((e) => PWA_ERROR.test(e.text)).map((e) => e.text),
      ...report.pageErrors.filter((e) => PWA_ERROR.test(e)),
      ...report.network
        .filter((n) => n.status >= 400 && isPwaRelated(n.url))
        .map((n) => `${n.status} ${n.url}`),
    ];
    if (offenders.length > 0) {
      return warn(this.check, m.failed ?? '', m.fix ?? '', offenders.slice(0, 5).join('; '));
    }
    return pass(this.check, m.ok);
  },
};

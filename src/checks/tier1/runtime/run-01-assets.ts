import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getRuntimeReport } from './shared.js';

// RUN-01 (scored): no failing same-origin asset requests. 401/403 are treated as
// auth-gated (skipped(auth-required)), not broken (SPEC §8 auth-aware).
export const run01: CheckModule = {
  check: {
    id: 'RUN-01',
    category: 'RuntimeHealth',
    title: 'no failing same-origin assets',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['RUN-01'] ?? {};
    const report = await getRuntimeReport(ctx);
    const fail = new Set(ctx.config.runtime.failOnStatus);
    const offenders = report.network.filter((n) => n.sameOrigin && fail.has(n.status));
    const authGated = report.network.filter((n) => n.status === 401 || n.status === 403);
    if (offenders.length > 0) {
      return warn(
        this.check,
        m.failed ?? '',
        m.fix ?? '',
        offenders.map((o) => `${o.status} ${o.url}`).join('; '),
      );
    }
    if (authGated.length > 0) return skip(this.check, 'auth-required');
    return pass(this.check, m.ok);
  },
};

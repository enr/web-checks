import { fail, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { getRuntimeReport } from '../runtime/shared.js';

function isSecureOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:') return true;
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

// INST-01 (live, blocking): served over HTTPS (or localhost); no mixed content.
export const inst01: CheckModule = {
  check: {
    id: 'INST-01',
    category: 'Installability',
    title: 'served over HTTPS',
    modes: ['live'],
    tier: 1,
    severity: 'error',
    blocking: true,
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['INST-01'] ?? {};
    const origin = ctx.input.baseUrl;
    if (!isSecureOrigin(origin)) {
      return fail(this.check, m.insecure ?? '', m.fix ?? '', origin);
    }
    // Mixed content: an https page loading http: resources.
    if (origin.startsWith('https:')) {
      const report = await getRuntimeReport(ctx);
      const insecure = report.network.filter((n) => n.url.startsWith('http://'));
      if (insecure.length > 0) {
        return fail(
          this.check,
          m.mixed ?? '',
          m.fix ?? '',
          insecure
            .map((i) => i.url)
            .slice(0, 5)
            .join('; '),
        );
      }
    }
    return pass(this.check, m.ok, origin);
  },
};

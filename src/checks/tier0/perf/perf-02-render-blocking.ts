import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from '../html/shared.js';

// PERF-02: no avoidable render-blocking scripts in <head> (sync, non-module).
export const perf02: CheckModule = {
  check: {
    id: 'PERF-02',
    category: 'Performance',
    title: 'no avoidable render-blocking scripts in head',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['PERF-02'] ?? {};
    const head = await parseHead(ctx);
    const blocking = head.scriptTags.filter(
      (s) => s.inHead && s.src && !s.async && !s.defer && !s.module,
    );
    if (blocking.length === 0) {
      return pass(this.check, m.ok);
    }
    return info(this.check, m.blocking ?? '', m.fix ?? '', blocking.map((s) => s.src).join(', '));
  },
};

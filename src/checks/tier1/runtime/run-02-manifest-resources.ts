import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest, manifestIcons } from '../../tier0/manifest/shared.js';
import { getRuntimeReport } from './shared.js';

// RUN-02 (scored): no 404 on manifest-declared resources (icons / start_url).
export const run02: CheckModule = {
  check: {
    id: 'RUN-02',
    category: 'RuntimeHealth',
    title: 'no 404 on manifest/precached resources',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['MAN-01'],
  async run(ctx) {
    const m = messages['RUN-02'] ?? {};
    if (!ctx.results.passed('MAN-01')) return skip(this.check, 'dependency');
    const report = await getRuntimeReport(ctx);
    const { json } = await loadManifest(ctx);
    const declared = new Set(
      manifestIcons(json)
        .map((i) => i.src)
        .filter((s): s is string => !!s)
        .map((s) => s.split(/[?#]/)[0]),
    );
    const offenders = report.network.filter(
      (n) => n.status === 404 && [...declared].some((d) => d && n.url.includes(d)),
    );
    if (offenders.length > 0) {
      return warn(this.check, m.failed ?? '', m.fix ?? '', offenders.map((o) => o.url).join('; '));
    }
    return pass(this.check, m.ok);
  },
};

import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { firstLinkByRel, parseHead } from './shared.js';

// MAN-01 vs HTML-01 anti-double-count (SPEC §1): tag presence lives here; the
// manifest file existence lives in MAN-01. If the tag is missing but MAN-01
// found the file at a conventional path, HTML-01 fails (serve it statically);
// if MAN-01 also failed, HTML-01 is skipped(dependency) to avoid double count.
export const html01: CheckModule = {
  check: {
    id: 'HTML-01',
    category: 'Html',
    title: '<link rel="manifest"> present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  dependsOn: ['MAN-01'],
  async run(ctx) {
    const head = await parseHead(ctx);
    const link = firstLinkByRel(head, 'manifest');
    if (link?.href) {
      return pass(this.check, messages['HTML-01']?.ok, `<link rel="manifest" href="${link.href}">`);
    }
    if (ctx.results.passed('MAN-01')) {
      return fail(
        this.check,
        messages['HTML-01']?.missingButFile ?? '',
        messages['HTML-01']?.fix ?? '',
      );
    }
    return skip(this.check, 'dependency');
  },
};

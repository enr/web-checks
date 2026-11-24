import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { firstLinkByRel, parseHead } from './shared.js';

// Presence-check of the apple-touch-icon tag lives here (SPEC §2, ICO-06↔HTML-05);
// ICO-06 verifies the icon quality and dependsOn this check.
export const html05: CheckModule = {
  check: {
    id: 'HTML-05',
    category: 'Html',
    title: 'apple-touch-icon link present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const head = await parseHead(ctx);
    const link = firstLinkByRel(head, 'apple-touch-icon');
    if (link?.href) {
      return pass(this.check, messages['HTML-05']?.ok, `href="${link.href}"`);
    }
    return warn(this.check, messages['HTML-05']?.missing ?? '', messages['HTML-05']?.fix ?? '');
  },
};

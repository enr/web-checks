import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { metaByName, parseHead } from './shared.js';

export const html03: CheckModule = {
  check: {
    id: 'HTML-03',
    category: 'Html',
    title: '<meta name="theme-color"> present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const head = await parseHead(ctx);
    const meta = metaByName(head, 'theme-color');
    if (meta?.content) {
      return pass(this.check, messages['HTML-03']?.ok, `content="${meta.content}"`);
    }
    return warn(this.check, messages['HTML-03']?.missing ?? '', messages['HTML-03']?.fix ?? '');
  },
};

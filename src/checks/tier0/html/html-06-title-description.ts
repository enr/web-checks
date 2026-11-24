import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { metaByName, parseHead } from './shared.js';

export const html06: CheckModule = {
  check: {
    id: 'HTML-06',
    category: 'Html',
    title: '<title> and meta description present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const head = await parseHead(ctx);
    const hasTitle = !!head.title;
    const hasDesc = !!metaByName(head, 'description')?.content;
    if (hasTitle && hasDesc) {
      return pass(this.check, messages['HTML-06']?.ok);
    }
    return info(this.check, messages['HTML-06']?.missing ?? '', messages['HTML-06']?.fix ?? '');
  },
};

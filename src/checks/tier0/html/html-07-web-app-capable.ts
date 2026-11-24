import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { metaByName, parseHead } from './shared.js';

export const html07: CheckModule = {
  check: {
    id: 'HTML-07',
    category: 'Html',
    title: 'apple-mobile-web-app-capable / mobile-web-app-capable',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const head = await parseHead(ctx);
    const capable =
      metaByName(head, 'mobile-web-app-capable')?.content ??
      metaByName(head, 'apple-mobile-web-app-capable')?.content;
    if (capable) {
      return pass(this.check, messages['HTML-07']?.ok);
    }
    return info(this.check, messages['HTML-07']?.missing ?? '', messages['HTML-07']?.fix ?? '');
  },
};

import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { hasCharset, parseHead } from './shared.js';

export const html04: CheckModule = {
  check: {
    id: 'HTML-04',
    category: 'Html',
    title: '<meta charset="utf-8"> present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const head = await parseHead(ctx);
    if (hasCharset(head)) {
      return pass(this.check, messages['HTML-04']?.ok);
    }
    return warn(this.check, messages['HTML-04']?.missing ?? '', messages['HTML-04']?.fix ?? '');
  },
};

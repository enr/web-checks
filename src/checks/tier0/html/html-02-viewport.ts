import { fail, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { metaByName, parseHead } from './shared.js';

export const html02: CheckModule = {
  check: {
    id: 'HTML-02',
    category: 'Html',
    title: '<meta name="viewport"> with width=device-width',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  async run(ctx) {
    const head = await parseHead(ctx);
    const meta = metaByName(head, 'viewport');
    if (!meta) {
      return fail(this.check, messages['HTML-02']?.missing ?? '', messages['HTML-02']?.fix ?? '');
    }
    if (!/width\s*=\s*device-width/i.test(meta.content ?? '')) {
      return fail(
        this.check,
        messages['HTML-02']?.noDeviceWidth ?? '',
        messages['HTML-02']?.fix ?? '',
        `content="${meta.content ?? ''}"`,
      );
    }
    return pass(this.check, messages['HTML-02']?.ok);
  },
};

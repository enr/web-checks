import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { firstLinkByRel, parseHead } from '../html/shared.js';
import { readPngSize } from './png.js';

// ICO-06: quality of the apple-touch-icon (SPEC §2, ICO-06↔HTML-05). The tag
// presence is HTML-05; here we verify the icon file (exists, PNG, >=180x180).
export const ico06: CheckModule = {
  check: {
    id: 'ICO-06',
    category: 'Icons',
    title: 'apple-touch-icon is a valid PNG >= 180x180',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['HTML-05'],
  async run(ctx) {
    if (!ctx.results.passed('HTML-05')) return skip(this.check, 'dependency');
    const m = messages['ICO-06'] ?? {};
    const head = await parseHead(ctx);
    const link = firstLinkByRel(head, 'apple-touch-icon');
    const href = link?.href;
    if (!href) return skip(this.check, 'dependency');

    const asset = await ctx.input.read(href);
    if (!asset) return warn(this.check, m.fileMissing ?? '', m.fix ?? '', href);

    const isPng =
      (asset.contentType ?? '').includes('image/png') ||
      href.toLowerCase().split(/[?#]/)[0]?.endsWith('.png');
    if (!isPng) return warn(this.check, m.notPng ?? '', m.fix ?? '', href);

    const size = readPngSize(asset.bytes);
    if (size && (size.width < 180 || size.height < 180)) {
      return warn(this.check, m.tooSmall ?? '', m.fix ?? '', `${size.width}x${size.height}`);
    }
    return pass(this.check, m.ok, href);
  },
};

import { info, pass } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { parseHead } from './shared.js';

// iOS ignores the manifest for launch screens: without apple-touch-startup-image
// links the first launch from the home screen shows a blank flash. Advisory —
// only relevant when iOS polish matters, so absence never costs points.
export const html08: CheckModule = {
  check: {
    id: 'HTML-08',
    category: 'Html',
    title: 'iOS splash screens (apple-touch-startup-image)',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['HTML-08'] ?? {};
    const head = await parseHead(ctx);
    const links = head.links.filter((l) =>
      l.rel.split(/\s+/).includes('apple-touch-startup-image'),
    );
    if (links.length === 0) {
      return info(this.check, m.missing ?? '', m.fix);
    }

    const medias = links.map((l) => (l.media ?? '').toLowerCase());
    const covers = (o: string): boolean =>
      medias.some((x) => x.includes(`orientation: ${o}`) || x.includes(`orientation:${o}`));
    const portrait = covers('portrait');
    const landscape = covers('landscape');
    const variants =
      portrait && landscape
        ? 'portrait + landscape variants'
        : portrait
          ? 'portrait variant only'
          : landscape
            ? 'landscape variant only'
            : 'no orientation media queries';
    return pass(this.check, m.ok, `${links.length} link(s), ${variants}`);
  },
};

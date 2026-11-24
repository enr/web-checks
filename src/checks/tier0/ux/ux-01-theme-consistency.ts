import { info, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { metaByName, parseHead } from '../html/shared.js';
import { loadManifest } from '../manifest/shared.js';

// UX-01: theme_color consistent between manifest and the meta tag.
export const ux01: CheckModule = {
  check: {
    id: 'UX-01',
    category: 'UX',
    title: 'theme_color consistent (manifest vs meta)',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  dependsOn: ['MAN-02'],
  async run(ctx) {
    const m = messages['UX-01'] ?? {};
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const head = await parseHead(ctx);
    const manifestColor = typeof json?.theme_color === 'string' ? json.theme_color : undefined;
    const metaColor = metaByName(head, 'theme-color')?.content;
    if (!manifestColor || !metaColor) return info(this.check, m.missing ?? '', m.fix ?? '');
    if (manifestColor.trim().toLowerCase() === metaColor.trim().toLowerCase()) {
      return pass(this.check, m.ok, manifestColor);
    }
    return info(
      this.check,
      m.mismatch ?? '',
      m.fix ?? '',
      `manifest=${manifestColor} meta=${metaColor}`,
    );
  },
};

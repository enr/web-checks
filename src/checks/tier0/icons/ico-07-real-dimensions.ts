import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { resolveIcons } from './shared.js';

// ICO-07: declared "sizes" match the real pixel dimensions of the PNG file.
export const ico07: CheckModule = {
  check: {
    id: 'ICO-07',
    category: 'Icons',
    title: 'declared sizes match real pixels',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['MAN-07'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-07')) return skip(this.check, 'dependency');
    const m = messages['ICO-07'] ?? {};
    const icons = await resolveIcons(ctx);
    const mismatches: string[] = [];
    let verified = 0;
    for (const r of icons) {
      if (!r.realSize || r.declaredSizes.length === 0) continue;
      verified++;
      const match = r.declaredSizes.some(
        (s) => s.width === r.realSize?.width && s.height === r.realSize?.height,
      );
      if (!match) {
        const declared = r.declaredSizes.map((s) => `${s.width}x${s.height}`).join('/');
        mismatches.push(
          `${r.icon.src}: declared ${declared}, real ${r.realSize.width}x${r.realSize.height}`,
        );
      }
    }
    if (mismatches.length > 0) {
      return warn(this.check, m.mismatch ?? '', m.fix ?? '', mismatches.join('; '));
    }
    // Nothing verifiable (no PNG files) — pass rather than warn.
    return pass(
      this.check,
      m.ok,
      verified > 0 ? `${verified} verified` : 'no PNG dimensions to verify',
    );
  },
};

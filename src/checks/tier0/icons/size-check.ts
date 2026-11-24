// Factory for ICO-01 (192) and ICO-02 (512): a square icon of the given size
// must be declared with purpose "any" and its file must exist. Blocking.

import type { Check } from '../../../core/check.js';
import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { resolveIcons } from './shared.js';

export function iconSizeCheck(id: 'ICO-01' | 'ICO-02', dim: number): CheckModule {
  const check: Check = {
    id,
    category: 'Icons',
    title: `${dim}x${dim} icon present and file exists`,
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    blocking: true,
    deterministic: true,
  };
  return {
    check,
    dependsOn: ['MAN-02'],
    async run(ctx) {
      if (!ctx.results.passed('MAN-02')) return skip(check, 'dependency');
      const m = messages[id] ?? {};
      const icons = await resolveIcons(ctx);
      const declaring = icons.filter((r) =>
        r.declaredSizes.some((s) => s.width === dim && s.height === dim),
      );
      if (declaring.length === 0) {
        return fail(check, m.notDeclared ?? '', m.fix ?? '');
      }
      const withAny = declaring.find((r) => r.purposes.has('any'));
      if (!withAny) {
        return fail(check, m.onlyMaskable ?? '', m.fix ?? '');
      }
      if (!withAny.exists) {
        return fail(check, m.fileMissing ?? '', m.fix ?? '', withAny.icon.src);
      }
      return pass(check, m.ok, withAny.path);
    },
  };
}

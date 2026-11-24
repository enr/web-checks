import { info, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from './shared.js';

interface ManifestScreenshot {
  src?: unknown;
  sizes?: unknown;
  form_factor?: unknown;
}

// Screenshots power the richer install UI on Chromium (dialog with preview
// instead of the bare mini-infobar). Advisory: absence never costs points, but
// when present the entries must be usable and cover both form factors.
export const man16: CheckModule = {
  check: {
    id: 'MAN-16',
    category: 'Manifest',
    title: 'screenshots present for a richer install UI',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  dependsOn: ['MAN-01', 'MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const m = messages['MAN-16'] ?? {};
    const { json } = await loadManifest(ctx);
    const raw = json?.screenshots;
    if (!Array.isArray(raw) || raw.length === 0) {
      return info(this.check, m.missing ?? '', m.fix);
    }

    const shots = raw.filter((s): s is ManifestScreenshot => typeof s === 'object' && s !== null);
    const isValidSizes = (v: unknown): boolean =>
      v === undefined || (typeof v === 'string' && /^\d+x\d+(\s+\d+x\d+)*$/i.test(v.trim()));
    const malformed =
      shots.length !== raw.length ||
      shots.some((s) => typeof s.src !== 'string' || s.src.length === 0 || !isValidSizes(s.sizes));
    if (malformed) {
      return info(this.check, m.malformed ?? '', m.fix);
    }

    const formFactors = new Set(
      shots.map((s) => s.form_factor).filter((f): f is string => typeof f === 'string'),
    );
    const missing = ['wide', 'narrow'].filter((f) => !formFactors.has(f));
    if (missing.length > 0) {
      return info(
        this.check,
        m.formFactor ?? '',
        m.fix,
        `${shots.length} screenshot(s), missing form_factor: ${missing.join(', ')}`,
      );
    }
    return pass(this.check, m.ok, `${shots.length} screenshots (wide + narrow)`);
  },
};

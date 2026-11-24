import { info } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { loadManifest } from '../manifest/shared.js';
import { loadServiceWorker } from '../sw/shared.js';

// Compatibility notes (SPEC §11) — advisory. Reports known cross-browser
// limitations for the PWA features the app relies on.
export const compat01: CheckModule = {
  check: {
    id: 'COMPAT-01',
    category: 'Compatibility',
    title: 'cross-browser compatibility notes',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const { found: hasManifest } = await loadManifest(ctx);
    const { found: hasSw } = await loadServiceWorker(ctx);
    const notes: string[] = [];
    if (hasManifest) {
      notes.push('iOS Safari ignores most manifest fields (uses apple-* meta tags).');
      notes.push('beforeinstallprompt is Chromium-only (no programmatic install on iOS/Firefox).');
    }
    if (hasSw) {
      notes.push('Service Workers: supported on modern browsers; iOS Safari support is limited.');
    }
    if (notes.length === 0) notes.push('No PWA features detected to report compatibility for.');
    return info(this.check, 'Compatibility notes', undefined, notes.join(' '));
  },
};

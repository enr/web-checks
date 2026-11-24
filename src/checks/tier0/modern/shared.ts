// Modern web-app API detection (SPEC §10) — advisory. Detected mainly from
// manifest fields (deterministic); each reports detected/not + a support note.

import type { Check } from '../../../core/check.js';
import { info } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { type ManifestJson, loadManifest } from '../manifest/shared.js';

export interface ModernApiSpec {
  id: string;
  title: string;
  /** Detected when this returns true. */
  detect(json: ManifestJson | undefined): boolean;
  /** Cross-browser support note shown in the report. */
  note: string;
}

export function modernApiCheck(spec: ModernApiSpec): CheckModule {
  const check: Check = {
    id: spec.id,
    category: 'ModernApis',
    title: spec.title,
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  };
  return {
    check,
    async run(ctx) {
      const { json } = await loadManifest(ctx);
      const detected = spec.detect(json);
      return info(
        check,
        `${spec.title}: ${detected ? 'detected' : 'not detected'}`,
        undefined,
        spec.note,
      );
    },
  };
}

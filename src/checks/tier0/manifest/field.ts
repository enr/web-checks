// Factory for the many "manifest field present" checks (MAN-03/04/08..15).
// Keeps one file per check while avoiding 13 near-identical bodies.

import type { Check } from '../../../core/check.js';
import { fail, info, pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { type ManifestJson, loadManifest } from './shared.js';

export interface FieldCheckSpec {
  check: Check;
  /** Returns true when the field is present/valid. */
  present(json: ManifestJson): boolean;
  /** Message key for the negative outcome (defaults to 'missing'). */
  missingKey?: string;
  /** Optional extra evidence when present. */
  evidence?(json: ManifestJson): string | undefined;
}

export function manifestField(spec: FieldCheckSpec): CheckModule {
  const { check } = spec;
  return {
    check,
    dependsOn: ['MAN-01', 'MAN-02'],
    async run(ctx) {
      if (!ctx.results.passed('MAN-02')) return skip(check, 'dependency');
      const { json } = await loadManifest(ctx);
      const m = messages[check.id] ?? {};
      if (json && spec.present(json)) {
        return pass(check, m.ok, spec.evidence?.(json));
      }
      const msg = m[spec.missingKey ?? 'missing'] ?? 'field missing';
      const fix = m.fix ?? '';
      switch (check.severity) {
        case 'error':
          return fail(check, msg, fix);
        case 'warning':
          return warn(check, msg, fix);
        case 'info':
          return info(check, msg, fix);
      }
    },
  };
}

export function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

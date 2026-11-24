import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';

// INST-02: installability criteria met — the sum of the prerequisites, read via
// ResultBag (SPEC §6, §A.4). Statically evaluated in build; confirmed at runtime
// in live (Tier 1 re-check lands in Phase 2). Blocking.
const PREREQS = ['MAN-01', 'MAN-02', 'MAN-06', 'MAN-07', 'ICO-01', 'ICO-02', 'SW-01'];

export const inst02: CheckModule = {
  check: {
    id: 'INST-02',
    category: 'Installability',
    title: 'installability criteria met',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    blocking: true,
    deterministic: true,
  },
  dependsOn: PREREQS,
  async run(ctx) {
    const failed = PREREQS.filter((id) => {
      const f = ctx.results.get(id);
      // A skipped prerequisite (e.g. not yet run) should not itself fail INST-02;
      // but a real non-pass (error) does.
      return f !== undefined && f.status !== 'pass' && f.status !== 'skipped';
    });
    // If a blocking prerequisite is missing entirely (skipped due to its own
    // dependency), installability cannot be confirmed → skip(dependency).
    const anySkipped = PREREQS.some((id) => ctx.results.get(id)?.status === 'skipped');
    if (failed.length === 0 && !anySkipped && PREREQS.every((id) => ctx.results.passed(id))) {
      return pass(this.check, messages['INST-02']?.ok);
    }
    if (failed.length > 0) {
      return fail(
        this.check,
        messages['INST-02']?.missing ?? '',
        messages['INST-02']?.fix ?? '',
        `failed prerequisites: ${failed.join(', ')}`,
      );
    }
    return skip(this.check, 'dependency');
  },
};

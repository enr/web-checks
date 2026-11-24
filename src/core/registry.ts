// Check catalog — an array of EXPLICIT imports (no filesystem auto-discovery):
// deterministic, tree-shakable, compatible with a future `bun build --compile`
// (IMPLEMENTATION_PLAN §A.2). Populated category by category during Phase 1.

import { compatChecks } from '../checks/tier0/compat/index.js';
import { htmlChecks } from '../checks/tier0/html/index.js';
import { iconChecks } from '../checks/tier0/icons/index.js';
import { installabilityChecks } from '../checks/tier0/installability/index.js';
import { manifestChecks } from '../checks/tier0/manifest/index.js';
import { modernApiChecks } from '../checks/tier0/modern/index.js';
import { offlineChecks } from '../checks/tier0/offline/index.js';
import { perfChecks } from '../checks/tier0/perf/index.js';
import { responsiveTier0Checks } from '../checks/tier0/responsive/index.js';
import { sourceChecks } from '../checks/tier0/src/index.js';
import { swChecks } from '../checks/tier0/sw/index.js';
import { uxChecks } from '../checks/tier0/ux/index.js';
import { installabilityLiveChecks } from '../checks/tier1/installability/index.js';
import { offlineLiveChecks } from '../checks/tier1/offline/index.js';
import { responsiveTier1Checks } from '../checks/tier1/responsive/index.js';
import { runtimeChecks } from '../checks/tier1/runtime/index.js';
import { swRuntimeChecks } from '../checks/tier1/sw/index.js';
import type { CheckModule } from './module.js';

/** The full, ordered catalog of check modules. */
export const ALL_CHECKS: readonly CheckModule[] = [
  ...manifestChecks,
  ...iconChecks,
  ...htmlChecks,
  ...swChecks,
  ...offlineChecks,
  ...installabilityChecks,
  ...uxChecks,
  ...perfChecks,
  ...responsiveTier0Checks,
  ...responsiveTier1Checks,
  ...runtimeChecks,
  ...swRuntimeChecks,
  ...installabilityLiveChecks,
  ...offlineLiveChecks,
  ...modernApiChecks,
  ...compatChecks,
  ...sourceChecks,
];

/** Look up a check module by its catalog id (e.g. "MAN-01"). */
export function getCheck(id: string): CheckModule | undefined {
  return ALL_CHECKS.find((m) => m.check.id === id);
}

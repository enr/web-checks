import type { CheckModule } from '../../../core/module.js';
import { off01 } from './off-01-fallback.js';
import { off03 } from './off-03-versioning.js';
import { off04 } from './off-04-cleanup.js';
import { off05 } from './off-05-skip-waiting.js';
import { off06 } from './off-06-clients-claim.js';

export const offlineChecks: CheckModule[] = [off01, off03, off04, off05, off06];

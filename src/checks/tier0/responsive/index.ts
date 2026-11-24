import type { CheckModule } from '../../../core/module.js';
import { rsp01 } from './rsp-01-viewport.js';
import { rsp05 } from './rsp-05-media-queries.js';

export const responsiveTier0Checks: CheckModule[] = [rsp01, rsp05];

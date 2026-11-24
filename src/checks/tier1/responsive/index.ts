import type { CheckModule } from '../../../core/module.js';
import { rsp02 } from './rsp-02-overflow.js';
import { rsp03 } from './rsp-03-touch-targets.js';
import { rsp04 } from './rsp-04-font-size.js';
import { rsp06 } from './rsp-06-fixed-width.js';
import { rsp07 } from './rsp-07-media-scaling.js';
import { rsp08 } from './rsp-08-adaptive.js';
import { rsp09 } from './rsp-09-overlap.js';
import { rsp10 } from './rsp-10-clipping.js';
import { rsp11 } from './rsp-11-reflow.js';

export const responsiveTier1Checks: CheckModule[] = [
  rsp02,
  rsp03,
  rsp04,
  rsp06,
  rsp07,
  rsp08,
  rsp09,
  rsp10,
  rsp11,
];

import type { CheckModule } from '../../../core/module.js';
import { perf01 } from './perf-01-budget.js';
import { perf02 } from './perf-02-render-blocking.js';
import { perf03 } from './perf-03-images.js';
import { perf04 } from './perf-04-preload.js';
import { perf05 } from './perf-05-sourcemaps.js';
import { perf06 } from './perf-06-hashed.js';

export const perfChecks: CheckModule[] = [perf01, perf02, perf03, perf04, perf05, perf06];

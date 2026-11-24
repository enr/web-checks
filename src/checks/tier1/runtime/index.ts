import type { CheckModule } from '../../../core/module.js';
import { run01 } from './run-01-assets.js';
import { run02 } from './run-02-manifest-resources.js';
import { run03 } from './run-03-sw-manifest-errors.js';
import { run04 } from './run-04-console.js';
import { run05 } from './run-05-5xx.js';

export const runtimeChecks: CheckModule[] = [run01, run02, run03, run04, run05];

import type { CheckModule } from '../../../core/module.js';
import { sw08 } from './sw-08-activated.js';
import { sw09 } from './sw-09-scope.js';

export const swRuntimeChecks: CheckModule[] = [sw08, sw09];

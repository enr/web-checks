import type { CheckModule } from '../../../core/module.js';
import { sw01 } from './sw-01-present.js';
import { sw02 } from './sw-02-registration.js';
import { sw03 } from './sw-03-install.js';
import { sw04 } from './sw-04-fetch.js';
import { sw05 } from './sw-05-activate.js';
import { sw06 } from './sw-06-cache-api.js';
import { sw07 } from './sw-07-strategy.js';

export const swChecks: CheckModule[] = [sw01, sw02, sw03, sw04, sw05, sw06, sw07];

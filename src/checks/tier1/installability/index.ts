import type { CheckModule } from '../../../core/module.js';
import { inst01 } from './inst-01-https.js';
import { inst03 } from './inst-03-beforeinstallprompt.js';

export const installabilityLiveChecks: CheckModule[] = [inst01, inst03];

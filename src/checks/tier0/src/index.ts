import type { CheckModule } from '../../../core/module.js';
import { src01 } from './src-01-manifest.js';
import { src02 } from './src-02-sw.js';
import { src03 } from './src-03-register.js';

export const sourceChecks: CheckModule[] = [src01, src02, src03];

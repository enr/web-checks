import type { CheckModule } from '../../../core/module.js';
import { ux01 } from './ux-01-theme-consistency.js';
import { ux02 } from './ux-02-display.js';
import { ux03 } from './ux-03-system-font.js';
import { ux04 } from './ux-04-shortcuts.js';
import { ux05 } from './ux-05-perceived-perf.js';

export const uxChecks: CheckModule[] = [ux01, ux02, ux03, ux04, ux05];

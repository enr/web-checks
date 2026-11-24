import type { CheckModule } from '../../../core/module.js';
import { man01 } from './man-01-present.js';
import { man02 } from './man-02-valid.js';
import { man03 } from './man-03-name.js';
import { man04 } from './man-04-short-name.js';
import { man05 } from './man-05-start-url.js';
import { man06 } from './man-06-display.js';
import { man07 } from './man-07-icons.js';
import { man08 } from './man-08-scope.js';
import { man09 } from './man-09-theme-color.js';
import { man10 } from './man-10-background-color.js';
import { man11 } from './man-11-description.js';
import { man12 } from './man-12-lang-dir.js';
import { man13 } from './man-13-orientation.js';
import { man14 } from './man-14-categories.js';
import { man15 } from './man-15-id.js';
import { man16 } from './man-16-screenshots.js';

export const manifestChecks: CheckModule[] = [
  man01,
  man02,
  man03,
  man04,
  man05,
  man06,
  man07,
  man08,
  man09,
  man10,
  man11,
  man12,
  man13,
  man14,
  man15,
  man16,
];

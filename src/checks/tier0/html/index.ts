import type { CheckModule } from '../../../core/module.js';
import { html01 } from './html-01-manifest-link.js';
import { html02 } from './html-02-viewport.js';
import { html03 } from './html-03-theme-color.js';
import { html04 } from './html-04-charset.js';
import { html05 } from './html-05-apple-touch-icon.js';
import { html06 } from './html-06-title-description.js';
import { html07 } from './html-07-web-app-capable.js';
import { html08 } from './html-08-splash-screens.js';

export const htmlChecks: CheckModule[] = [
  html01,
  html02,
  html03,
  html04,
  html05,
  html06,
  html07,
  html08,
];

import { info } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { loadServiceWorker } from '../../tier0/sw/shared.js';

const PUSH_RE = /addEventListener\s*\(\s*['"`]push['"`]|self\s*\.\s*onpush\s*=/;
const CLICK_RE =
  /addEventListener\s*\(\s*['"`]notificationclick['"`]|self\s*\.\s*onnotificationclick\s*=/;

// Web Push is the one Modern API detected from the SW source rather than the
// manifest: a 'push' handler receives the message, 'notificationclick' handles
// the tap. Reporting both separately points at the half that is missing.
export const mod07: CheckModule = {
  check: {
    id: 'MOD-07',
    category: 'ModernApis',
    title: 'Web Push notifications (SW handlers)',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'info',
    deterministic: true,
  },
  async run(ctx) {
    const sw = await loadServiceWorker(ctx);
    const code = sw.raw ?? '';
    const push = PUSH_RE.test(code);
    const click = CLICK_RE.test(code);
    const detected = push || click;
    const detail = detected
      ? ` (push handler: ${push ? 'yes' : 'no'}, notificationclick: ${click ? 'yes' : 'no'})`
      : '';
    return info(
      this.check,
      `Web Push notifications: ${detected ? 'detected' : 'not detected'}${detail}`,
      undefined,
      'Chromium/Firefox supported; iOS 16.4+ only for installed PWAs.',
    );
  },
};

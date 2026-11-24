import { pass, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';

// INST-03 (live): beforeinstallprompt available within 5s after load. The event
// is Chromium-only and requires installability criteria to already be met.
export const inst03: CheckModule = {
  check: {
    id: 'INST-03',
    category: 'Installability',
    title: 'beforeinstallprompt available at runtime',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  async run(ctx) {
    const m = messages['INST-03'] ?? {};
    if (!ctx.browser) return pass(this.check, m.ok, 'no browser');
    const route = ctx.config.routes[0] ?? '/';
    const url = ctx.input.baseUrl + (route.startsWith('/') ? route : `/${route}`);
    const page = await ctx.browser.newPage(ctx.auth?.session);
    try {
      await page.addInitScript(
        'window.__bip=false;addEventListener("beforeinstallprompt",()=>{window.__bip=true;});',
      );
      await page.goto(url, { waitUntil: 'load' });
      const fired = await page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return (window as unknown as { __bip?: boolean }).__bip === true;
      });
      if (fired) return pass(this.check, m.ok);
      return warn(this.check, m.missing ?? '', m.fix ?? '');
    } finally {
      await page.close();
    }
  },
};

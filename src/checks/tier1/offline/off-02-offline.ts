import { pass, skip, warn } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';

// OFF-02 (live): the app responds with useful content offline (SPEC §A.9 order).
export const off02: CheckModule = {
  check: {
    id: 'OFF-02',
    category: 'Offline',
    title: 'app responds with useful content offline',
    modes: ['live'],
    tier: 1,
    severity: 'warning',
    deterministic: true,
  },
  dependsOn: ['SW-08'],
  async run(ctx) {
    const m = messages['OFF-02'] ?? {};
    if (!ctx.browser) return skip(this.check, 'no-browser');
    const route = ctx.config.routes[0] ?? '/';
    const url = ctx.input.baseUrl + (route.startsWith('/') ? route : `/${route}`);
    const page = await ctx.browser.newPage(ctx.auth?.session);
    try {
      // 1. online load + wait for the SW to be ready.
      await page.goto(url, { waitUntil: 'networkidle' });
      const controlled = await page.evaluate(async () => {
        // biome-ignore lint/suspicious/noExplicitAny: browser context
        const nav: any = navigator;
        if (!('serviceWorker' in nav)) return false;
        const timeout = new Promise((r) => setTimeout(() => r(null), 5000));
        await Promise.race([nav.serviceWorker.ready, timeout]);
        return !!nav.serviceWorker.controller;
      });
      // 2. if not controlling yet (no clients.claim), reload once.
      if (!controlled) await page.goto(url, { waitUntil: 'networkidle' });

      // 3. go offline and navigate again.
      await page.setOffline(true);
      let status = 0;
      try {
        ({ status } = await page.goto(url, { waitUntil: 'load' }));
      } catch {
        status = 0;
      }
      // 4. useful content served by the SW?
      const bodyLen = await page
        .evaluate(() => document.body?.innerText?.trim().length ?? 0)
        .catch(() => 0);
      if ((status === 200 || status === 0) && bodyLen > 0) {
        return pass(this.check, m.ok, `offline body length ${bodyLen}`);
      }
      return warn(this.check, m.failed ?? '', m.fix ?? '', `status=${status} bodyLen=${bodyLen}`);
    } finally {
      // 5. always restore the network.
      await page.setOffline(false).catch(() => {});
      await page.close();
    }
  },
};

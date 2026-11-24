// Shared Tier 1 Service Worker runtime state: navigate the start_url and await
// the SW to activate (with a timeout), reading its scope and controller status.

import type { CheckContext } from '../../../core/module.js';
import type { InputSource } from '../../../loaders/input.js';

export interface SwRuntime {
  supported: boolean;
  active: boolean;
  controller: boolean;
  scope: string | null;
}

const cache = new WeakMap<InputSource, Promise<SwRuntime>>();

export function getSwRuntime(ctx: CheckContext): Promise<SwRuntime> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = collect(ctx);
  cache.set(ctx.input, p);
  return p;
}

async function collect(ctx: CheckContext): Promise<SwRuntime> {
  const { browser, input, auth, config } = ctx;
  const empty: SwRuntime = { supported: false, active: false, controller: false, scope: null };
  if (!browser) return empty;
  const route = config.routes[0] ?? '/';
  const url = input.baseUrl + (route.startsWith('/') ? route : `/${route}`);
  const page = await browser.newPage(auth?.session);
  try {
    await page.goto(url, { waitUntil: 'load' });
    return await page.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: browser context
      const nav: any = navigator;
      if (!('serviceWorker' in nav)) {
        return { supported: false, active: false, controller: false, scope: null };
      }
      const timeout = new Promise((res) => setTimeout(() => res(null), 5000));
      // biome-ignore lint/suspicious/noExplicitAny: browser context
      const reg: any = await Promise.race([nav.serviceWorker.ready, timeout]);
      return {
        supported: true,
        active: !!reg?.active,
        controller: !!nav.serviceWorker.controller,
        scope: reg?.scope ?? null,
      };
    });
  } finally {
    await page.close();
  }
}

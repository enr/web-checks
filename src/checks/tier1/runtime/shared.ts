// Shared Tier 1 runtime capture: navigate each route with console/pageerror/
// response listeners attached and collect a per-run report. RUN-* read from it.
// SPEC §8 (Runtime Health): only same-origin, PWA-related signals are scored.

import type { CheckContext } from '../../../core/module.js';
import type { InputSource } from '../../../loaders/input.js';

export interface NetworkEvent {
  url: string;
  status: number;
  sameOrigin: boolean;
}

export interface ConsoleEvent {
  type: string;
  text: string;
}

export interface RuntimeReport {
  origin: string;
  network: NetworkEvent[];
  consoleErrors: ConsoleEvent[];
  pageErrors: string[];
}

const cache = new WeakMap<InputSource, Promise<RuntimeReport>>();

export function getRuntimeReport(ctx: CheckContext): Promise<RuntimeReport> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = collect(ctx);
  cache.set(ctx.input, p);
  return p;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function isIgnored(url: string, origin: string, ctx: CheckContext): boolean {
  const evOrigin = originOf(url);
  // Default: only same-origin is considered; everything else is ignored.
  if (evOrigin !== origin) return true;
  for (const ig of ctx.config.runtime.ignoreOrigins) {
    if (evOrigin === ig || evOrigin.includes(ig)) return true;
  }
  for (const glob of ctx.config.runtime.ignoreUrls) {
    const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    if (re.test(url)) return true;
  }
  return false;
}

async function collect(ctx: CheckContext): Promise<RuntimeReport> {
  const { browser, config, input, auth } = ctx;
  const origin = originOf(input.baseUrl) || input.baseUrl;
  const report: RuntimeReport = { origin, network: [], consoleErrors: [], pageErrors: [] };
  if (!browser) return report;

  for (const route of config.routes) {
    const url = input.baseUrl + (route.startsWith('/') ? route : `/${route}`);
    const page = await browser.newPage(auth?.session);
    try {
      page.on('response', (e: unknown) => {
        const res = e as { url(): string; status(): number };
        try {
          const u = res.url();
          report.network.push({ url: u, status: res.status(), sameOrigin: originOf(u) === origin });
        } catch {
          /* ignore malformed */
        }
      });
      page.on('console', (e: unknown) => {
        const msg = e as { type(): string; text(): string };
        try {
          if (msg.type() === 'error')
            report.consoleErrors.push({ type: 'error', text: msg.text() });
        } catch {
          /* ignore */
        }
      });
      page.on('pageerror', (e: unknown) => {
        const err = e as { message?: string };
        report.pageErrors.push(err?.message ?? String(e));
      });
      await page.goto(url, { waitUntil: 'networkidle' });
    } finally {
      await page.close();
    }
  }
  // Drop ignored (third-party) network events up front.
  report.network = report.network.filter((n) => !isIgnored(n.url, origin, ctx));
  return report;
}

const PWA_RELATED = /(sw\.js|service-?worker|serviceworker|manifest|workbox)/i;

export function isPwaRelated(url: string): boolean {
  return PWA_RELATED.test(url);
}

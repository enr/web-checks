// In-process Playwright implementation of BrowserDriver (Node).
// The single module that imports `playwright` (IMPLEMENTATION_PLAN §A.3).
// Lazy-imported so Tier 0 never pays for it and CI without a browser still runs.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthSession, Cookie, SessionStorageEntry, StorageState } from '../auth/types.js';
import { isPathPattern, matchesPathPattern, resolveAgainst } from '../auth/url-match.js';
import type { AuthPage, BrowserDriver, DriverPage, Viewport, WaitUntil } from './driver.js';

/**
 * Discover a pre-installed Chromium executable under PLAYWRIGHT_BROWSERS_PATH.
 * Used as a fallback when the bundled Playwright browser revision differs from
 * the one available in the environment (e.g. managed CI images).
 */
function discoverChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return undefined;
  }
  const candidates = entries
    .filter((e) => e.startsWith('chromium'))
    .sort()
    .reverse();
  for (const dir of candidates) {
    for (const bin of [
      'chrome-linux64/chrome', // Playwright >= 1.49 layout
      'chrome-headless-shell-linux64/chrome-headless-shell',
      'chrome-linux/chrome', // older layout
      'chrome-linux/headless_shell',
    ]) {
      const p = join(root, dir, bin);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

// Minimal structural types to avoid importing playwright types at module load.
type PwBrowser = {
  newContext(opts?: unknown): Promise<PwContext>;
  close(): Promise<void>;
};
type PwContext = {
  newPage(): Promise<PwPage>;
  pages(): PwPage[];
  setOffline(offline: boolean): Promise<void>;
  addInitScript(script: { content: string }): Promise<void>;
  addCookies(cookies: unknown[]): Promise<void>;
  storageState(opts?: { indexedDB?: boolean }): Promise<StorageState>;
  close(): Promise<void>;
};
type PwPage = {
  goto(url: string, opts?: { waitUntil?: string }): Promise<{ status(): number } | null>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<T>(fn: (arg: unknown) => T, arg?: unknown): Promise<T>;
  on(event: string, cb: (e: unknown) => void): void;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  waitForURL(url: string | ((url: URL) => boolean), opts?: { timeout?: number }): Promise<void>;
  waitForLoadState(state: string, opts?: { timeout?: number }): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>;
  isVisible(selector: string): Promise<boolean>;
  url(): string;
  close(): Promise<void>;
};

/** Bounded wait for 'networkidle' after 'load'; see goto() below. */
const NETWORK_IDLE_GRACE_MS = 5000;

class PlaywrightPage implements DriverPage {
  constructor(
    private readonly page: PwPage,
    private readonly context: PwContext,
  ) {}

  async goto(url: string, opts?: { waitUntil?: WaitUntil }): Promise<{ status: number }> {
    const waitUntil = opts?.waitUntil ?? 'load';
    if (waitUntil !== 'networkidle') {
      const res = await this.page.goto(url, { waitUntil });
      return { status: res ? res.status() : 0 };
    }
    // 'networkidle' never fires on apps with continuous traffic (polling,
    // analytics, websocket keep-alives), so a plain goto would time out the
    // whole check. Land on 'load', then give the network a bounded chance to
    // settle and proceed either way.
    const res = await this.page.goto(url, { waitUntil: 'load' });
    await this.page
      .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_GRACE_MS })
      .catch(() => {});
    return { status: res ? res.status() : 0 };
  }

  async setViewport(v: Viewport): Promise<void> {
    await this.page.setViewportSize({ width: v.width, height: v.height });
  }

  evaluate<T>(fn: (arg?: unknown) => T, arg?: unknown): Promise<T> {
    return this.page.evaluate(fn as (arg: unknown) => T, arg);
  }

  on(event: 'console' | 'pageerror' | 'response', cb: (e: unknown) => void): void {
    this.page.on(event, cb);
  }

  async setOffline(offline: boolean): Promise<void> {
    await this.context.setOffline(offline);
  }

  async addInitScript(js: string): Promise<void> {
    await this.context.addInitScript({ content: js });
  }

  storageState(): Promise<StorageState> {
    return this.context.storageState();
  }

  async close(): Promise<void> {
    await this.page.close();
    await this.context.close();
  }
}

class PlaywrightAuthPage implements AuthPage {
  constructor(
    private readonly page: PwPage,
    private readonly context: PwContext,
    private readonly baseUrl: string,
  ) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(resolveAgainst(url, this.baseUrl), { waitUntil: 'load' });
  }
  fill(selector: string, value: string): Promise<void> {
    return this.page.fill(selector, value);
  }
  click(selector: string): Promise<void> {
    return this.page.click(selector);
  }
  press(selector: string, key: string): Promise<void> {
    return this.page.press(selector, key);
  }
  waitForUrl(glob: string, timeoutMs = 10000): Promise<void> {
    const matcher = isPathPattern(glob)
      ? (url: URL) => matchesPathPattern(glob, url.href, this.baseUrl)
      : glob;
    return this.page.waitForURL(matcher, { timeout: timeoutMs });
  }
  waitForSelector(selector: string, timeoutMs = 10000): Promise<void> {
    return this.page.waitForSelector(selector, { timeout: timeoutMs });
  }
  async setCookie(cookie: Cookie): Promise<void> {
    const url = new URL(this.baseUrl);
    await this.context.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain ?? url.hostname,
        path: cookie.path ?? '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
      },
    ]);
  }
  async setLocalStorage(key: string, value: string): Promise<void> {
    await this.page.goto(this.baseUrl, { waitUntil: 'load' });
    await this.page.evaluate(
      (arg) => {
        const { k, v } = arg as { k: string; v: string };
        localStorage.setItem(k, v);
      },
      { k: key, v: value },
    );
  }
  async setSessionStorage(key: string, value: string): Promise<void> {
    // sessionStorage lives in the tab: write it on the page the flow continues
    // in, landing on baseUrl only when nothing is open yet.
    if (!/^https?:/.test(this.page.url())) {
      await this.page.goto(this.baseUrl, { waitUntil: 'load' });
    }
    await this.page.evaluate(
      (arg) => {
        const { k, v } = arg as { k: string; v: string };
        sessionStorage.setItem(k, v);
      },
      { k: key, v: value },
    );
  }
  isVisible(selector: string): Promise<boolean> {
    return this.page.isVisible(selector);
  }
  currentUrl(): string {
    return this.page.url();
  }
  raw(): unknown {
    return this.page;
  }
  storageState(): Promise<StorageState> {
    return captureState(this.context);
  }
  async close(): Promise<void> {
    await this.page.close().catch(() => {});
    await this.context.close().catch(() => {});
  }
}

/**
 * Full session state of a context: cookies, localStorage and IndexedDB (where
 * Firebase Auth keeps its tokens) from Playwright, plus the sessionStorage of
 * every open page (where MSAL keeps them), which Playwright does not persist.
 */
async function captureState(context: PwContext): Promise<StorageState> {
  const state = await context.storageState({ indexedDB: true });
  const byOrigin = new Map<string, SessionStorageEntry>();
  for (const page of context.pages()) {
    const entry = await page
      .evaluate(() => ({
        origin: location.origin,
        entries: Object.keys(sessionStorage)
          .filter((name) => name !== '__web_checks_seeded__')
          .map((name) => ({ name, value: sessionStorage.getItem(name) ?? '' })),
      }))
      .catch(() => null);
    if (!entry || !/^https?:/.test(entry.origin) || entry.entries.length === 0) continue;
    const prev = byOrigin.get(entry.origin);
    byOrigin.set(
      entry.origin,
      prev ? { ...entry, entries: [...prev.entries, ...entry.entries] } : entry,
    );
  }
  return byOrigin.size > 0 ? { ...state, sessionStorage: [...byOrigin.values()] } : state;
}

/**
 * Init script that seeds sessionStorage once per tab and origin, before the
 * app's scripts run, so later writes by the app are not overwritten on the
 * next navigation.
 */
function sessionStorageSeed(entries: SessionStorageEntry[]): string {
  return `(() => {
  const all = ${JSON.stringify(entries)};
  try {
    if (sessionStorage.getItem('__web_checks_seeded__')) return;
    const mine = all.find((e) => e.origin === location.origin);
    if (!mine) return;
    for (const { name, value } of mine.entries) sessionStorage.setItem(name, value);
    sessionStorage.setItem('__web_checks_seeded__', '1');
  } catch {}
})();`;
}

/** Options of a browser context that carries an authenticated session. */
function contextOptions(session?: AuthSession): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  if (session?.storageState) {
    // Playwright rejects keys it does not know; sessionStorage is seeded apart.
    const { sessionStorage: _ss, ...pwState } = session.storageState;
    opts.storageState = pwState;
  }
  if (session?.headers) opts.extraHTTPHeaders = session.headers;
  if (session?.httpCredentials) opts.httpCredentials = session.httpCredentials;
  return opts;
}

/** Apply the parts of a session that are not context options. */
async function applySession(context: PwContext, session?: AuthSession): Promise<void> {
  if (!session) return;
  if (session.cookies && session.cookies.length > 0) {
    await context.addCookies(session.cookies);
  }
  const ss = [...(session.storageState?.sessionStorage ?? []), ...(session.sessionStorage ?? [])];
  if (ss.length > 0) await context.addInitScript({ content: sessionStorageSeed(ss) });
}

export class PlaywrightDriver implements BrowserDriver {
  private browser: PwBrowser | null = null;

  async launch(opts?: { headless?: boolean }): Promise<void> {
    const { chromium } = await import('playwright');
    const headless = opts?.headless ?? true;
    try {
      this.browser = (await chromium.launch({ headless })) as unknown as PwBrowser;
    } catch (err) {
      // Fallback to a discovered pre-installed Chromium when the bundled
      // browser revision is missing (environment/version mismatch).
      const executablePath = discoverChromium();
      if (!executablePath) throw err;
      this.browser = (await chromium.launch({
        headless,
        executablePath,
      })) as unknown as PwBrowser;
    }
  }

  async newPage(session?: AuthSession): Promise<DriverPage> {
    if (!this.browser) throw new Error('driver not launched');
    const context = await this.browser.newContext(contextOptions(session));
    await applySession(context, session);
    const page = await context.newPage();
    return new PlaywrightPage(page, context);
  }

  async newAuthPage(baseUrl = 'http://localhost/', session?: AuthSession): Promise<AuthPage> {
    if (!this.browser) throw new Error('driver not launched');
    const context = await this.browser.newContext(contextOptions(session));
    await applySession(context, session);
    const page = await context.newPage();
    return new PlaywrightAuthPage(page, context, baseUrl);
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

export type LaunchResult =
  | { driver: BrowserDriver; reason?: undefined }
  | { driver: null; reason: string };

/**
 * Create and launch a Playwright driver. On failure returns the reason instead
 * of throwing, so the caller decides whether a missing browser is fatal (Tier 1
 * checks were selected) or not.
 */
export async function launchDriver(opts?: { headless?: boolean }): Promise<LaunchResult> {
  const driver = new PlaywrightDriver();
  try {
    await driver.launch(opts);
    return { driver };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Cannot find (package|module) ['"]?playwright/i.test(msg)) {
      return { driver: null, reason: 'the playwright package is not installed' };
    }
    if (/Executable doesn't exist|browserType\.launch: .*not found/i.test(msg)) {
      return {
        driver: null,
        reason: 'no Chromium for Playwright: run `playwright install --only-shell chromium`',
      };
    }
    return { driver: null, reason: `Chromium failed to start: ${msg.split('\n')[0]}` };
  }
}

/**
 * Try to create and launch a Playwright driver. Returns null if Playwright or a
 * browser is unavailable.
 */
export async function tryLaunchDriver(opts?: {
  headless?: boolean;
}): Promise<BrowserDriver | null> {
  return (await launchDriver(opts)).driver;
}

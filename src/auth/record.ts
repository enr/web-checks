// `web-checks auth record`: open a visible browser on the target, let a person
// log in by hand (any provider: OAuth/OIDC, SAML, MFA, passkeys, captchas),
// then save the session to a file that live runs load with --auth-state.
// The login is done by the person, so nothing about it is scripted or stored
// besides the resulting session.

import type { BrowserDriver } from '../browser/driver.js';
import type { Logger } from '../core/logger.js';
import { writeSessionFile } from './cache.js';
import { AuthError, loginWallReason } from './dsl.js';
import type { HttpCredentials, ReadyCondition, StorageState } from './types.js';

export interface RecordOptions {
  url: string;
  output: string;
  /** Saves as soon as it holds; without it, the person presses Enter. */
  ready?: ReadyCondition;
  httpCredentials?: HttpCredentials;
  /** Overall time allowed for the login (default 10 minutes). */
  timeoutMs?: number;
  /** Resolves when the person confirms they are logged in (Enter on stdin). */
  confirm?: () => Promise<void>;
  /** Lets a caller (tests) drive the page instead of a person. */
  drive?: (page: unknown) => Promise<void>;
  driver: BrowserDriver;
  log: Logger;
}

export interface RecordResult {
  output: string;
  cookies: number;
  origins: number;
  sessionStorage: number;
  indexedDB: number;
}

const DEFAULT_RECORD_TIMEOUT_MS = 10 * 60 * 1000;

export async function recordSession(opts: RecordOptions): Promise<RecordResult> {
  const { driver, log, url } = opts;
  const page = await driver.newAuthPage(
    url,
    opts.httpCredentials ? { httpCredentials: opts.httpCredentials } : undefined,
  );
  try {
    await page.goto(url);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_RECORD_TIMEOUT_MS;
    const waits: Promise<string>[] = [];
    if (opts.ready?.url || opts.ready?.selector) {
      waits.push(
        (async () => {
          if (opts.ready?.url) await page.waitForUrl(opts.ready.url, timeoutMs);
          if (opts.ready?.selector) await page.waitForSelector(opts.ready.selector, timeoutMs);
          return 'ready';
        })(),
      );
    }
    if (opts.confirm) waits.push(opts.confirm().then(() => 'confirmed'));
    if (opts.drive) waits.push(opts.drive(page.raw()).then(() => 'driven'));
    if (waits.length === 0) throw new Error('recordSession: nothing to wait for');
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<string>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(new AuthError(`auth record: no login within ${Math.round(timeoutMs / 1000)}s`)),
        timeoutMs,
      );
    });
    try {
      const how = await Promise.race([...waits, timeout]);
      log.debug(`auth record: ${how} at ${page.currentUrl()}`);
    } catch (err) {
      if (err instanceof AuthError) throw err;
      const msg = (err as Error).message.split('\n')[0] ?? '';
      if (/closed|disconnected/i.test(msg)) {
        throw new AuthError(
          'auth record: the browser was closed before the session was saved; log in, then press Enter in the terminal while the browser is still open',
        );
      }
      throw new AuthError(`auth record: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    const wall = await loginWallReason(page);
    if (wall)
      log.warn(`auth record: the page still looks like a login page (${wall}); saving anyway.`);

    const state = await page.storageState();
    await writeSessionFile(opts.output, state, { url });
    return { output: opts.output, ...summarize(state) };
  } finally {
    await page.close();
  }
}

function summarize(state: StorageState): Omit<RecordResult, 'output'> {
  return {
    cookies: state.cookies.length,
    origins: state.origins.length,
    sessionStorage: (state.sessionStorage ?? []).reduce((n, e) => n + e.entries.length, 0),
    indexedDB: state.origins.reduce((n, o) => n + (o.indexedDB?.length ?? 0), 0),
  };
}

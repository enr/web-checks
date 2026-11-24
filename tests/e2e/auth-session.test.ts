// Sessions that cannot be scripted (OAuth/SSO): recorded once, then reused.
// The fixture keeps its token where OAuth clients do: sessionStorage (MSAL),
// IndexedDB (Firebase Auth).

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AuthError } from '../../src/auth/dsl.js';
import { recordSession } from '../../src/auth/record.js';
import { authenticate } from '../../src/auth/runner.js';
import type { BrowserDriver } from '../../src/browser/driver.js';
import { tryLaunchDriver } from '../../src/browser/playwright.js';
import { ConsoleLogger, SecretRegistry } from '../../src/core/logger.js';
import { fixturePath } from '../helpers/run.js';
import { type StaticServer, startStaticServer } from '../helpers/server.js';

type RawPage = {
  goto(url: string): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForSelector(s: string): Promise<unknown>;
};

const logs = () => {
  const secrets = new SecretRegistry();
  return { secrets, log: new ConsoleLogger(secrets, 'error') };
};

describe('recorded sessions (auth record / --auth-state)', () => {
  let server: StaticServer;
  let driver: BrowserDriver | null;
  let dir: string;

  beforeAll(async () => {
    server = await startStaticServer(fixturePath('auth-session'));
    driver = await tryLaunchDriver({ headless: true });
    dir = await mkdtemp(join(tmpdir(), 'wc-auth-'));
  });
  afterAll(async () => {
    await driver?.close();
    await server?.close();
  });

  test('records sessionStorage + IndexedDB and restores them in the checks', async () => {
    if (!driver) return;
    const output = join(dir, 'state.json');
    const { log, secrets } = logs();
    const result = await recordSession({
      url: `${server.url}/`,
      output,
      driver,
      log,
      ready: { selector: '[data-testid=app-shell]' },
      // Stands in for the person logging in.
      drive: async (raw) => {
        const page = raw as RawPage;
        await page.evaluate(() => sessionStorage.setItem('token', 'from-oauth'));
        await page.goto(`${server.url}/idb.html`);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const open = indexedDB.open('auth', 1);
              open.onupgradeneeded = () => open.result.createObjectStore('kv');
              open.onsuccess = () => {
                const tx = open.result.transaction('kv', 'readwrite');
                tx.objectStore('kv').put('id-token', 'token');
                tx.oncomplete = () => resolve();
              };
            }),
        );
        await page.goto(`${server.url}/`);
        await new Promise<never>(() => {}); // the ready condition ends the wait
      },
    });
    expect(result.sessionStorage).toBe(1);
    expect(result.indexedDB).toBe(1);
    const saved = JSON.parse(await readFile(output, 'utf8'));
    expect(saved.url).toBe(`${server.url}/`);

    const auth = await authenticate(
      { storageState: output, ready: { selector: '[data-testid=app-shell]' } },
      { driver, baseUrl: server.url, secrets, log },
    );
    const page = await driver.newPage(auth.session);
    try {
      await page.goto(`${server.url}/`);
      expect(await page.evaluate(() => location.pathname)).toBe('/');
      expect(await page.evaluate(() => !!document.querySelector('[data-testid=app-shell]'))).toBe(
        true,
      );
      await page.goto(`${server.url}/idb.html`);
      await new Promise((r) => setTimeout(r, 300));
      expect(await page.evaluate(() => !!document.getElementById('idb-ok'))).toBe(true);
    } finally {
      await page.close();
    }
  }, 60000);

  test('an expired recorded session stops the run and says how to fix it', async () => {
    if (!driver) return;
    const output = join(dir, 'expired.json');
    await writeFile(output, JSON.stringify({ cookies: [], origins: [] }));
    const { log, secrets } = logs();
    const err = await authenticate(
      { storageState: output },
      { driver, baseUrl: server.url, secrets, log },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as Error).message).toMatch(/still at a login page|password field/);
    expect((err as Error).message).toContain(`web-checks auth record ${server.url} -o ${output}`);
  }, 30000);

  test('a stale cache falls back to a fresh login', async () => {
    if (!driver) return;
    const cache = join(dir, 'cache.json');
    await writeFile(
      cache,
      JSON.stringify({ savedAt: Date.now(), storageState: { cookies: [], origins: [] } }),
    );
    const module = join(dir, 'auth.mjs');
    await writeFile(
      module,
      `export default { steps: [ { goto: '/login.html' }, { setSessionStorage: { key: 'token', value: 't' } }, { goto: '/' } ], ready: { selector: '[data-testid=app-shell]' } };`,
    );
    const { log, secrets } = logs();
    const auth = await authenticate(
      { module, cache: { path: cache, ttl: 60_000 } },
      { driver, baseUrl: server.url, secrets, log },
    );
    expect(auth.storageState?.sessionStorage?.[0]?.entries).toEqual([
      { name: 'token', value: 't' },
    ]);
    const rewritten = JSON.parse(await readFile(cache, 'utf8'));
    expect(rewritten.storageState.sessionStorage).toHaveLength(1);
  }, 30000);

  test('without ready, a login form left on screen fails the login', async () => {
    if (!driver) return;
    const module = join(dir, 'bad-auth.mjs');
    await writeFile(module, `export default { steps: [ { goto: '/' } ] };`);
    const { log, secrets } = logs();
    await expect(
      authenticate({ module }, { driver, baseUrl: server.url, secrets, log }),
    ).rejects.toThrow(/auth failed \/ expired/);
  }, 30000);

  test('session-form cookies reach the pages', async () => {
    if (!driver) return;
    const module = join(dir, 'cookie-auth.mjs');
    await writeFile(module, `export default { cookies: [{ name: 'sid', value: 'abc' }] };`);
    const { log, secrets } = logs();
    const auth = await authenticate({ module }, { driver, baseUrl: server.url, secrets, log });
    const page = await driver.newPage(auth.session);
    try {
      await page.goto(`${server.url}/login.html`);
      expect(await page.evaluate(() => document.cookie)).toContain('sid=abc');
    } finally {
      await page.close();
    }
  }, 30000);
});

describe('HTTP credentials (Basic auth in front of the app)', () => {
  let server: Server;
  let url: string;
  let driver: BrowserDriver | null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const expected = `Basic ${Buffer.from('ci:s3cret').toString('base64')}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="staging"' });
        res.end('auth required');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>ok</title><p id="ok">in</p>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    driver = await tryLaunchDriver({ headless: true });
  });
  afterAll(async () => {
    await driver?.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  test('pages are opened with the credentials, which are redacted', async () => {
    if (!driver) return;
    process.env.WC_TEST_HTTP_PASS = 's3cret';
    try {
      const { log, secrets } = logs();
      const auth = await authenticate(
        { httpCredentials: { username: 'ci', password: '{{secret.WC_TEST_HTTP_PASS}}' } },
        { driver, baseUrl: url, secrets, log },
      );
      expect(secrets.redact('pw s3cret')).not.toContain('s3cret');
      const page = await driver.newPage(auth.session);
      try {
        const { status } = await page.goto(`${url}/`);
        expect(status).toBe(200);
        expect(await page.evaluate(() => !!document.getElementById('ok'))).toBe(true);
      } finally {
        await page.close();
      }
    } finally {
      Reflect.deleteProperty(process.env, 'WC_TEST_HTTP_PASS');
    }
  }, 30000);
});

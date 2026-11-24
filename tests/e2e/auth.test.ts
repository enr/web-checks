import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authenticate } from '../../src/auth/runner.js';
import type { BrowserDriver } from '../../src/browser/driver.js';
import { tryLaunchDriver } from '../../src/browser/playwright.js';
import { ConsoleLogger, SecretRegistry } from '../../src/core/logger.js';
import { fixturePath } from '../helpers/run.js';
import { type StaticServer, startStaticServer } from '../helpers/server.js';

describe('auth (DSL + session forms)', () => {
  let server: StaticServer;
  let driver: BrowserDriver | null;

  beforeAll(async () => {
    server = await startStaticServer(fixturePath('auth-spa'));
    driver = await tryLaunchDriver({ headless: true });
  });
  afterAll(async () => {
    await driver?.close();
    await server?.close();
  });

  test('DSL auth sets localStorage, passes the ready guard and captures state', async () => {
    if (!driver) return; // no browser
    const secrets = new SecretRegistry();
    const log = new ConsoleLogger(secrets, 'error');
    const auth = await authenticate(
      { module: join(fixturePath('auth-spa'), 'auth.mjs') },
      { driver, baseUrl: server.url, secrets, log },
    );
    const origins = auth.storageState?.origins ?? [];
    const ls = origins.flatMap((o) => o.localStorage);
    expect(ls.some((e) => e.name === 'token' && e.value === 'abc123')).toBe(true);
  }, 45000);

  test('session form returns headers without a browser', async () => {
    const secrets = new SecretRegistry();
    const log = new ConsoleLogger(secrets, 'error');
    const auth = await authenticate(
      { headers: { Authorization: 'Bearer test-token' } },
      { driver: null, baseUrl: server.url, secrets, log },
    );
    expect(auth.session.headers?.Authorization).toBe('Bearer test-token');
  });
});

import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('OFF-03/04/05/06', () => {
  test('versioned cache name -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'OFF-03')).status).toBe('pass');
  });
  test('cleanup in activate -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'OFF-04')).status).toBe('pass');
  });
  test('skipWaiting -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'OFF-05')).status).toBe('pass');
  });
  test('clients.claim -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'OFF-06')).status).toBe('pass');
  });
  test('Workbox SW satisfies OFF-05 by construction', async () => {
    expect((await runSingleCheck('sw-workbox', 'OFF-05')).status).toBe('pass');
  });
  test('no-fetch SW without skipWaiting -> info', async () => {
    expect((await runSingleCheck('sw-no-fetch', 'OFF-05')).status).toBe('info');
  });
});

describe('INST-02 installability', () => {
  test('pass when all prerequisites pass (golden PWA)', async () => {
    expect((await runSingleCheck('manifest-ok', 'INST-02')).status).toBe('pass');
  });
  test('fails when a prerequisite fails (missing SW)', async () => {
    const f = await runSingleCheck('sw-missing', 'INST-02');
    // sw-missing has icons declared but no icon files, and no SW -> prerequisites fail.
    expect(['error', 'skipped']).toContain(f.status);
  });
});

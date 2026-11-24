import { describe, expect, test } from 'vitest';
import { analyzeSw } from '../../src/checks/tier0/sw/shared.js';
import { runSingleCheck } from '../helpers/run.js';

describe('SW-01 presence', () => {
  test('pass when a SW file exists', async () => {
    expect((await runSingleCheck('manifest-ok', 'SW-01')).status).toBe('pass');
  });
  test('error (blocking) when no SW file', async () => {
    const f = await runSingleCheck('sw-missing', 'SW-01');
    expect(f.status).toBe('error');
    expect(f.check.blocking).toBe(true);
  });
});

describe('SW-02 registration', () => {
  test('pass when register() is in the bundle', async () => {
    expect((await runSingleCheck('manifest-ok', 'SW-02')).status).toBe('pass');
  });
  test('error when no register() call', async () => {
    expect((await runSingleCheck('sw-missing', 'SW-02')).status).toBe('error');
  });
});

describe('SW-04 fetch handler', () => {
  test('pass on a SW with a fetch handler', async () => {
    expect((await runSingleCheck('manifest-ok', 'SW-04')).status).toBe('pass');
  });
  test('warning when no fetch handler', async () => {
    expect((await runSingleCheck('sw-no-fetch', 'SW-04')).status).toBe('warning');
  });
  test('pass by construction for a Workbox-generated SW', async () => {
    const f = await runSingleCheck('sw-workbox', 'SW-04');
    expect(f.status).toBe('pass');
    expect(f.message.toLowerCase()).toContain('workbox');
  });
});

describe('SW-04 skipped when SW absent', () => {
  test('skipped(dependency)', async () => {
    const f = await runSingleCheck('sw-missing', 'SW-04');
    expect(f.status).toBe('skipped');
    expect(f.skipReason).toBe('dependency');
  });
});

describe('analyzeSw unit', () => {
  test('detects handlers, cache API, skipWaiting, clientsClaim', () => {
    const a = analyzeSw(`
      self.addEventListener('install', () => { caches.open('v1'); });
      self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });
      self.addEventListener('activate', () => {});
      self.skipWaiting();
      self.clients.claim();
    `);
    expect(a.events.has('install')).toBe(true);
    expect(a.events.has('fetch')).toBe(true);
    expect(a.events.has('activate')).toBe(true);
    expect(a.usesCacheApi).toBe(true);
    expect(a.skipWaiting).toBe(true);
    expect(a.clientsClaim).toBe(true);
  });
  test('detects self.onfetch assignment form', () => {
    expect(analyzeSw('self.onfetch = (e) => {};').events.has('fetch')).toBe(true);
  });
  test('flags Workbox-generated SW', () => {
    expect(analyzeSw('workbox.precaching.precacheAndRoute([]);').workboxGenerated).toBe(true);
  });
});

import { describe, expect, test } from 'vitest';
import {
  analyzeSw,
  importedSpecifiers,
  resolveSpecifier,
} from '../../src/checks/tier0/sw/shared.js';
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
  test('pass when register() is in a chunk the entry imports (code splitting)', async () => {
    const f = await runSingleCheck('sw-chunked', 'SW-02');
    expect(f.status).toBe('pass');
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

describe('SW registration: import following', () => {
  test('collects relative static, re-export and literal dynamic imports', () => {
    const code =
      'import{a as i}from"./c/a.js";import"./c/b.js";export{x}from"../d.js";import("./lazy.js");import x from"lit";';
    expect(importedSpecifiers(code)).toEqual([
      './c/a.js',
      './c/b.js',
      '../d.js',
      './lazy.js',
      'lit',
    ]);
  });
  test('resolves against the importer path and skips bare specifiers', () => {
    expect(resolveSpecifier('/assets/app.js', './chunks/a.js')).toBe('/assets/chunks/a.js');
    expect(resolveSpecifier('/assets/chunks/a.js', '../b.js')).toBe('/assets/b.js');
    expect(resolveSpecifier('/assets/app.js', 'lit')).toBeNull();
    expect(resolveSpecifier('https://cdn.example/x/app.js', './y.js')).toBe(
      'https://cdn.example/x/y.js',
    );
  });
});

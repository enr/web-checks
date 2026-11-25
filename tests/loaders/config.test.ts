import { describe, expect, test } from 'vitest';
import { rebaseConfigPaths, resolveConfig } from '../../src/loaders/config.js';
import { validateConfig } from '../../src/loaders/validate.js';

describe('validateConfig', () => {
  test('validates the auth keys', () => {
    expect(
      validateConfig({
        auth: {
          module: 'auth.mjs',
          storageState: 'state.json',
          cache: { path: '.cache/auth.json', ttl: 3600000 },
          ready: { selector: '#app' },
          headers: { 'X-Api-Key': '{{secret.KEY}}' },
          httpCredentials: { username: 'u', password: '{{secret.P}}' },
          refresh: false,
        },
      }).errors,
    ).toEqual([]);
    const { errors } = validateConfig({
      auth: {
        modul: 'x',
        cache: { path: 'c.json' },
        ready: {},
        httpCredentials: { username: 'u' },
        storageState: 1,
      },
    });
    expect(errors).toEqual([
      'unknown config key "auth.modul"',
      '"auth.storageState" must be a string',
      '"auth.cache" must be { path: string, ttl: number of ms > 0 }',
      '"auth.ready" must be { url?: glob, selector?: css, timeoutMs?: number } with url or selector',
      '"auth.httpCredentials" must be { username: string, password: string }',
    ]);
  });

  test('accepts a valid config', () => {
    const { config, errors } = validateConfig({ ignore: ['UX-03'], weights: { Manifest: 25 } });
    expect(errors).toEqual([]);
    expect(config?.ignore).toEqual(['UX-03']);
  });

  test('rejects unknown keys (typo)', () => {
    const { errors } = validateConfig({ ignoer: ['X'] });
    expect(errors.some((e) => e.includes('unknown config key "ignoer"'))).toBe(true);
  });

  test('rejects the reserved includeAdvisoryInScore key', () => {
    const { errors } = validateConfig({ includeAdvisoryInScore: true });
    expect(errors.some((e) => e.includes('includeAdvisoryInScore'))).toBe(true);
  });

  test('accumulates multiple errors', () => {
    const { errors } = validateConfig({ ignore: 'nope', routes: 5, unknownX: 1 });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  test('type-checks failBelowGrade and points minGrade to it', () => {
    expect(validateConfig({ failBelowGrade: 'Z' }).errors.length).toBe(1);
    expect(validateConfig({ failBelowGrade: 'C' }).errors).toEqual([]);
    expect(validateConfig({ minGrade: 'C' }).errors[0]).toContain('renamed "failBelowGrade"');
  });
});

describe('resolveConfig merge', () => {
  test('user overrides apply over defaults; unspecified stay default', () => {
    const cfg = resolveConfig({
      targets: [{ mode: 'build', target: './x' }],
      user: { layout: { minTouchTargetPx: 48 }, routes: ['/a', '/b'] },
    });
    expect(cfg.layout.minTouchTargetPx).toBe(48);
    expect(cfg.layout.minFontSizePx).toBe(12); // default preserved
    expect(cfg.routes).toEqual(['/a', '/b']);
    expect(cfg.perf.initialBudgetKb).toBe(300);
  });

  test('--timeout beats the config-file httpMs; navigationMs stays', () => {
    const cfg = resolveConfig({
      targets: [{ mode: 'live', target: 'https://x' }],
      httpTimeoutMs: 5000,
      user: { timeouts: { httpMs: 9999 } },
    });
    expect(cfg.timeouts.httpMs).toBe(5000);
    expect(cfg.timeouts.navigationMs).toBe(30000);
  });

  test('--fail-below-grade beats failBelowGrade in the config file', () => {
    const cfg = resolveConfig({
      targets: [{ mode: 'build', target: './x' }],
      failBelowGrade: 'B',
      user: { failBelowGrade: 'A' },
    });
    expect(cfg.failBelowGrade).toBe('B');
    const fromFile = resolveConfig({
      targets: [{ mode: 'build', target: './x' }],
      user: { failBelowGrade: 'A' },
    });
    expect(fromFile.failBelowGrade).toBe('A'); // the config file alone enables the gate
  });
});

describe('packs in the config file', () => {
  test('accepts known packs and rejects unknown ones', () => {
    expect(validateConfig({ packs: ['runtime', 'pwa'] }).errors).toEqual([]);
    const { errors } = validateConfig({ packs: ['runtime', 'seo'] });
    expect(errors).toEqual([
      'unknown pack "seo" in "packs" (expected: runtime, responsive, head, pwa, perf, compat, modern)',
    ]);
    expect(validateConfig({ packs: 'runtime' }).errors).toEqual([
      '"packs" must be an array of strings',
    ]);
  });

  test('--pack beats packs from the config file; no packs means defaults + detection', () => {
    const targets = [{ mode: 'build' as const, target: '.' }];
    expect(resolveConfig({ targets }).packs).toBeUndefined();
    expect(resolveConfig({ targets, user: { packs: ['head'] } }).packs).toEqual(['head']);
    expect(resolveConfig({ targets, packs: ['pwa'], user: { packs: ['head'] } }).packs).toEqual([
      'pwa',
    ]);
  });
});

describe('rebaseConfigPaths', () => {
  test('resolves the auth paths against the folder of the config file', () => {
    const config = {
      routes: ['/x'],
      auth: {
        module: './auth.mjs',
        storageState: 'state.json',
        cache: { path: '../.cache/auth.json', ttl: 1000 },
        ready: { selector: '#app' },
      },
    };
    expect(rebaseConfigPaths(config, '/repo/.config/web/web-checks.config.mjs')).toEqual({
      routes: ['/x'],
      auth: {
        module: '/repo/.config/web/auth.mjs',
        storageState: '/repo/.config/web/state.json',
        cache: { path: '/repo/.config/.cache/auth.json', ttl: 1000 },
        ready: { selector: '#app' },
      },
    });
    // the input is left as it was
    expect(config.auth.module).toBe('./auth.mjs');
  });

  test('keeps absolute paths and configs without auth', () => {
    const abs = { auth: { module: '/abs/auth.mjs' } };
    expect(rebaseConfigPaths(abs, '/repo/web-checks.config.json')).toEqual(abs);
    const none = { routes: ['/'] };
    expect(rebaseConfigPaths(none, '/repo/web-checks.config.json')).toBe(none);
  });
});

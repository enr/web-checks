import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseSessionFile, readAuthCache, writeSessionFile } from '../../src/auth/cache.js';
import { mergeAuthConfig } from '../../src/cli/run.js';

const state = { cookies: [{ name: 'sid', value: 'x' }], origins: [] };

describe('session files', () => {
  test('accepts the web-checks format and a plain Playwright storageState', () => {
    expect(
      parseSessionFile(JSON.stringify({ savedAt: 1, storageState: state })).storageState,
    ).toEqual(state);
    expect(parseSessionFile(JSON.stringify(state)).storageState).toEqual(state);
    expect(() => parseSessionFile('{"foo":1}')).toThrow(/not a session file/);
  });

  test('are written readable by the owner only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wc-session-'));
    const path = join(dir, 'nested', 'state.json');
    await writeSessionFile(path, state, { url: 'https://app.example' });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved).toMatchObject({
      tool: 'web-checks',
      url: 'https://app.example',
      storageState: state,
    });
    expect(await readAuthCache(path, 60_000)).toEqual(state);
    expect(await readAuthCache(path, -1)).toBeNull();
  });
});

describe('mergeAuthConfig', () => {
  test('the config file auth is used when no flag is given', () => {
    expect(mergeAuthConfig({ module: 'a.js' }, undefined)).toEqual({ module: 'a.js' });
  });

  test('flags beat the config file; --auth-cache keeps the file TTL', () => {
    expect(
      mergeAuthConfig(
        { module: 'a.js', cache: { path: 'old.json', ttl: 1000 } },
        { module: 'b.js', cache: { path: 'new.json', ttl: 5 } },
      ),
    ).toEqual({ module: 'b.js', cache: { path: 'new.json', ttl: 1000 } });
  });

  test('a cache alone authenticates nothing', () => {
    expect(mergeAuthConfig({ cache: { path: 'c.json', ttl: 1 } }, undefined)).toBeUndefined();
    expect(mergeAuthConfig(undefined, undefined)).toBeUndefined();
  });
});

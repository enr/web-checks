import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ModeError, detectMode, parseModeFlag, resolveModes } from '../../src/core/modes.js';

async function scratch(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pwa-modes-'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

describe('detectMode', () => {
  test('http(s) URL -> live', async () => {
    expect((await detectMode('https://app.example.com')).mode).toBe('live');
  });

  test('folder with index.html and no package.json -> build', async () => {
    const dir = await scratch({ 'index.html': '<!doctype html><title>x</title>' });
    expect((await detectMode(dir)).mode).toBe('build');
  });

  test('folder with index.html + package.json but hashed assets -> build', async () => {
    const dir = await scratch({
      'index.html': '<script src="/assets/app.4f3a9b2c.js"></script>',
      'package.json': '{}',
    });
    expect((await detectMode(dir)).mode).toBe('build');
  });

  test('folder with index.html + package.json, no hashed assets -> source', async () => {
    const dir = await scratch({
      'index.html': '<script src="/src/main.ts"></script>',
      'package.json': '{}',
    });
    expect((await detectMode(dir)).mode).toBe('source');
  });

  test('folder without index.html -> source', async () => {
    const dir = await scratch({ 'package.json': '{}' });
    expect((await detectMode(dir)).mode).toBe('source');
  });
});

describe('resolveModes', () => {
  test('two targets on the same mode is a usage error', async () => {
    await expect(resolveModes(['https://a.com', 'https://b.com'])).rejects.toBeInstanceOf(
      ModeError,
    );
  });

  test('explicit --mode is matched to targets in order', async () => {
    const r = await resolveModes(['./a', './b'], ['source', 'build']);
    expect(r.map((x) => x.mode)).toEqual(['source', 'build']);
  });

  test('--mode length mismatch is an error', async () => {
    await expect(resolveModes(['./a', './b'], ['source'])).rejects.toBeInstanceOf(ModeError);
  });
});

describe('parseModeFlag', () => {
  test('parses comma list', () => {
    expect(parseModeFlag('build,live')).toEqual(['build', 'live']);
  });
  test('rejects invalid token', () => {
    expect(() => parseModeFlag('build,nope')).toThrow(ModeError);
  });
});

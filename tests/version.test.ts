import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { VERSION } from '../src/version.js';

describe('version', () => {
  test('src/version.ts matches package.json (the release workflow checks the tag too)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });
});

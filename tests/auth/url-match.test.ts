import { describe, expect, test } from 'vitest';
import { isPathPattern, matchesPathPattern, resolveAgainst } from '../../src/auth/url-match.js';

const base = 'https://app.example.com/';

describe('ready URL matching', () => {
  test('a path is matched against the page path, whatever the query and hash', () => {
    expect(
      matchesPathPattern('/app/index.html', 'https://app.example.com/app/index.html', base),
    ).toBe(true);
    expect(
      matchesPathPattern('/app/index.html', 'https://app.example.com/app/index.html#!/', base),
    ).toBe(true);
    expect(
      matchesPathPattern('/app/index.html', 'https://app.example.com/app/index.html?x=1', base),
    ).toBe(true);
    expect(matchesPathPattern('/app/index.html', 'https://app.example.com/login', base)).toBe(
      false,
    );
  });

  test('another origin never matches', () => {
    expect(matchesPathPattern('/app', 'https://idp.example.com/app', base)).toBe(false);
  });

  test('globs: * within a segment, ** across segments', () => {
    expect(matchesPathPattern('/app/*', 'https://app.example.com/app/home', base)).toBe(true);
    expect(matchesPathPattern('/app/*', 'https://app.example.com/app/a/b', base)).toBe(false);
    expect(matchesPathPattern('/app/**', 'https://app.example.com/app/a/b', base)).toBe(true);
  });

  test('a # in the pattern compares the hash too', () => {
    const p = '/app/index.html#!/profile';
    expect(matchesPathPattern(p, 'https://app.example.com/app/index.html#!/profile', base)).toBe(
      true,
    );
    expect(matchesPathPattern(p, 'https://app.example.com/app/index.html#!/', base)).toBe(false);
  });

  test('only paths are resolved against the target', () => {
    expect(isPathPattern('/app')).toBe(true);
    expect(isPathPattern('**/app')).toBe(false);
    expect(isPathPattern('https://x.test/app')).toBe(false);
    expect(isPathPattern('//cdn.test/app')).toBe(false);
    expect(resolveAgainst('/app/index.html', base)).toBe('https://app.example.com/app/index.html');
    expect(resolveAgainst('https://x.test/a', base)).toBe('https://x.test/a');
  });
});

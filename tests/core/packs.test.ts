import { describe, expect, test } from 'vitest';
import {
  ADVISORY_PACKS,
  DEFAULT_PACKS,
  PACKS,
  matchesPattern,
  packOf,
  selectModules,
} from '../../src/core/packs.js';
import { ALL_CHECKS } from '../../src/core/registry.js';

const ids = (pack: string): string[] =>
  ALL_CHECKS.filter((m) => packOf(m.check) === pack).map((m) => m.check.id);

describe('packOf', () => {
  test('every check of the catalog belongs to a known pack', () => {
    for (const m of ALL_CHECKS) expect(PACKS).toContain(packOf(m.check));
  });

  test('generic packs hold no manifest or service-worker check', () => {
    for (const pack of ['runtime', 'responsive', 'head']) {
      for (const id of ids(pack)) expect(id).not.toMatch(/^(MAN|ICO|SW|OFF|INST|SRC)-/);
    }
  });

  test('the split categories go where the SPEC says', () => {
    expect(ids('head').sort()).toEqual(['HTML-02', 'HTML-04', 'HTML-06']);
    expect(ids('runtime')).not.toContain('RUN-02');
    expect(ids('runtime')).not.toContain('RUN-03');
    expect(ids('pwa')).toEqual(expect.arrayContaining(['RUN-02', 'RUN-03', 'HTML-01', 'UX-01']));
    expect(ids('responsive')).toEqual(expect.arrayContaining(['UX-03', 'UX-05']));
  });

  test('all blocking checks are in the pwa pack', () => {
    for (const m of ALL_CHECKS.filter((x) => x.check.blocking)) {
      expect(packOf(m.check)).toBe('pwa');
    }
  });

  test('advisory packs contain only info checks', () => {
    for (const pack of ADVISORY_PACKS) {
      for (const m of ALL_CHECKS.filter((x) => packOf(x.check) === pack)) {
        expect(m.check.severity).toBe('info');
      }
    }
  });

  test('pwa is not a default pack (it is detected)', () => {
    expect(DEFAULT_PACKS).not.toContain('pwa');
  });
});

describe('matchesPattern', () => {
  test.each([
    ['RUN-01', 'RUN-01', true],
    ['RUN-01', 'run-01', true],
    ['RUN-01', 'RUN-*', true],
    ['RUN-01', '*', true],
    ['MAN-10', 'MAN-0*', false],
    ['MAN-01', 'MAN-0*', true],
    ['RUN-01', 'RUN-0', false],
    ['A.B', 'A.B', true],
    ['AxB', 'A.B', false],
  ])('%s ~ %s → %s', (id, pattern, expected) => {
    expect(matchesPattern(id, pattern)).toBe(expected);
  });
});

describe('selectModules', () => {
  test('packs select their checks and nothing else', () => {
    const sel = selectModules(ALL_CHECKS, { packs: new Set(['head']) });
    expect([...sel.selected].sort()).toEqual(['HTML-02', 'HTML-04', 'HTML-06']);
    expect(sel.dependencies.size).toBe(0);
  });

  test('--only pulls in the transitive dependencies as non-reported modules', () => {
    const sel = selectModules(ALL_CHECKS, { packs: new Set(), only: ['ICO-03'] });
    expect([...sel.selected]).toEqual(['ICO-03']);
    // ICO-03 -> MAN-07 -> MAN-01, MAN-02 (MAN-02 -> MAN-01)
    expect([...sel.dependencies].sort()).toEqual(['MAN-01', 'MAN-02', 'MAN-07']);
    expect(sel.modules.map((m) => m.check.id).sort()).toEqual([
      'ICO-03',
      'MAN-01',
      'MAN-02',
      'MAN-07',
    ]);
  });

  test('the default packs need no check from an inactive pack', () => {
    const sel = selectModules(ALL_CHECKS, { packs: new Set(DEFAULT_PACKS) });
    expect(sel.dependencies.size).toBe(0);
  });
});

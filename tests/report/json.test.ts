import { describe, expect, test } from 'vitest';
import type { Check } from '../../src/core/check.js';
import { fail, pass, skip, warn } from '../../src/core/finding.js';
import { resolveConfig } from '../../src/loaders/config.js';
import { formatJson } from '../../src/report/json.js';
import {
  type RunResult,
  allPacksActive,
  buildPackResults,
  countOutcomes,
} from '../../src/report/result.js';

function check(overrides: Partial<Check>): Check {
  return {
    id: 'MAN-01',
    category: 'Manifest',
    title: 'Manifest present',
    modes: ['build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
    ...overrides,
  };
}

function runResult(findings: RunResult['findings']): RunResult {
  return {
    targets: [{ mode: 'build', target: './dist' }],
    findings,
    score: {
      score: 42,
      grade: 'F',
      cappedByBlocker: 'MAN-01',
      categories: [
        {
          category: 'Manifest',
          ratio: 0.5,
          weight: 100,
          applicableWeight: 6,
          passedWeight: 3,
        },
        { category: 'Icons', ratio: null, weight: 0, applicableWeight: 0, passedWeight: 0 },
      ],
    },
    counts: countOutcomes(findings),
    advisory: false,
    packs: buildPackResults(
      findings,
      resolveConfig({ targets: [{ mode: 'build', target: './dist' }] }),
      allPacksActive(),
    ),
  };
}

describe('formatJson', () => {
  test('emits valid, complete, machine-readable JSON', () => {
    const json = formatJson(
      runResult([
        fail(
          check({ blocking: true }),
          'No web app manifest found',
          'Add a manifest.webmanifest',
          'dist/index.html',
        ),
        warn(check({ id: 'MAN-04', severity: 'warning' }), 'short_name missing', 'Add it'),
        pass(check({ id: 'MAN-03' })),
        skip(check({ id: 'SW-08' }), 'no-browser'),
      ]),
    );

    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.tool).toBe('web-checks');
    expect(typeof parsed.version).toBe('string');
    expect(parsed.targets).toEqual([{ mode: 'build', target: './dist' }]);
    expect(parsed.advisory).toBe(false);
    expect(parsed.score).toEqual({
      score: 42,
      grade: 'F',
      cappedByBlocker: 'MAN-01',
      // Categories with no applicable checks (ratio null) are omitted.
      categories: [{ category: 'Manifest', ratio: 0.5, weight: 100 }],
    });
    expect(parsed.counts).toEqual({ passed: 1, warnings: 1, errors: 1, skipped: 1, info: 0 });
    expect(parsed.gate).toBeUndefined();

    expect(parsed.findings).toHaveLength(4);
    const [error, warning, passed, skipped] = parsed.findings;
    expect(error).toEqual({
      id: 'MAN-01',
      category: 'Manifest',
      pack: 'pwa',
      title: 'Manifest present',
      tier: 0,
      severity: 'error',
      blocking: true,
      status: 'error',
      message: 'No web app manifest found',
      fix: 'Add a manifest.webmanifest',
      evidence: 'dist/index.html',
    });
    expect(warning.status).toBe('warning');
    // Optional fields are omitted, never null.
    expect('fix' in passed).toBe(false);
    expect('evidence' in passed).toBe(false);
    expect(skipped.skipReason).toBe('no-browser');
    // Every pack is listed in canonical order; only graded packs carry a score.
    expect(parsed.packs.map((p: { pack: string }) => p.pack)).toEqual([
      'runtime',
      'responsive',
      'head',
      'pwa',
      'perf',
      'compat',
      'modern',
    ]);
    const pwa = parsed.packs.find((p: { pack: string }) => p.pack === 'pwa');
    expect(pwa).toMatchObject({ active: true, reason: 'selected', advisory: false });
    expect(pwa.score).toMatchObject({ grade: 'F', cappedByBlocker: 'MAN-01' });
    expect(parsed.packs.find((p: { pack: string }) => p.pack === 'head').score).toBeUndefined();
    expect(parsed.packs.find((p: { pack: string }) => p.pack === 'perf').advisory).toBe(true);
    // No ANSI escape codes, ever.
    expect(json.includes(String.fromCharCode(27))).toBe(false);
  });

  test('includes the CI gate outcome when enabled', () => {
    const result = runResult([]);
    result.gate = { failBelowGrade: 'C', passed: false };
    const parsed = JSON.parse(formatJson(result));
    expect(parsed.gate).toEqual({ failBelowGrade: 'C', passed: false });
  });
});

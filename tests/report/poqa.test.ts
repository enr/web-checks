import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import type { Check } from '../../src/core/check.js';
import { fail, info, pass, skip, warn } from '../../src/core/finding.js';
import { POQA_SCHEMA, formatPoqa } from '../../src/report/poqa.js';
import { type RunResult, allPacksActive, countOutcomes } from '../../src/report/result.js';

// Copy of docs/schemas/poqa-findings.v1.json from enr/effective-train, the
// owner of the contract: refresh it from there when the schema changes.
const schema = JSON.parse(
  readFileSync(new URL('../schemas/poqa-findings.v1.json', import.meta.url), 'utf8'),
);
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

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

function runResult(findings: RunResult['findings'], extra: Partial<RunResult> = {}): RunResult {
  return {
    targets: [{ mode: 'live', target: 'https://app.test' }],
    findings,
    score: { score: 42, grade: 'F', cappedByBlocker: 'MAN-01', categories: [] },
    counts: countOutcomes(findings),
    advisory: false,
    packs: allPacksActive().map((p) => ({ ...p, advisory: false })),
    ...extra,
  };
}

function parse(result: RunResult) {
  const out = formatPoqa(result, new Date('2026-11-22T10:00:00Z'));
  const doc = JSON.parse(out);
  const ok = validate(doc);
  expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 2)).toEqual([]);
  expect(ok).toBe(true);
  return doc;
}

describe('formatPoqa', () => {
  test('maps every outcome onto poqa-findings/v1 and matches the schema', () => {
    const doc = parse(
      runResult(
        [
          fail(check({ blocking: true }), 'No manifest', 'Add one', 'dist/index.html'),
          warn(
            check({ id: 'RUN-04', category: 'RuntimeHealth', severity: 'warning', tier: 1 }),
            '2 console errors',
            'Fix them',
          ),
          pass(check({ id: 'HTML-02', category: 'Html' })),
          info(check({ id: 'PERF-05', category: 'Performance', severity: 'info' }), 'note'),
          skip(check({ id: 'SW-08', category: 'ServiceWorker', tier: 1 }), 'no-browser'),
        ],
        { gate: { failBelowGrade: 'C', passed: false } },
      ),
    );
    expect(doc.schema).toBe(POQA_SCHEMA);
    expect(doc.tool.name).toBe('web-checks');
    expect(doc.generated_at).toBe('2026-11-22T10:00:00.000Z');
    expect(doc.subject).toEqual({ kind: 'web', targets: ['https://app.test'] });
    expect(doc.complete).toBe(true);
    expect(doc.gate).toEqual({ passed: false, threshold: '--fail-below-grade C' });
    expect(doc.properties.grade).toBe('F');

    const [blocker, warning, passed, information, skipped] = doc.results;
    expect(blocker).toMatchObject({
      check: 'MAN-01',
      fingerprint: 'MAN-01',
      status: 'fail',
      severity: 'critical',
      category: 'pwa',
      hint: 'Add one',
      evidence: [{ name: 'evidence', observed: 'dist/index.html' }],
    });
    expect(warning).toMatchObject({ status: 'warn', severity: 'medium', category: 'runtime' });
    expect(passed.status).toBe('pass');
    expect(information).toMatchObject({ status: 'pass', properties: { outcome: 'info' } });
    expect(skipped).toMatchObject({
      status: 'skipped',
      skip_reason: 'Requires a browser (Playwright) which is not available',
      properties: { skipReason: 'no-browser' },
    });

    expect(doc.summary).toEqual({
      total: 5,
      by_status: { pass: 2, warn: 1, fail: 1, error: 0, skipped: 1 },
      by_severity: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
    });
  });

  test('a build-only run is about code and has no gate without --fail-below-grade', () => {
    const doc = parse(
      runResult([pass(check({}))], { targets: [{ mode: 'build', target: './dist' }] }),
    );
    expect(doc.subject.kind).toBe('code');
    expect(doc.gate).toBeUndefined();
  });
});

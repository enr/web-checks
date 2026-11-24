import { describe, expect, test } from 'vitest';
import type { Check } from '../../src/core/check.js';
import { fail, pass, skip, warn } from '../../src/core/finding.js';
import { PACKS } from '../../src/core/packs.js';
import { formatAgent } from '../../src/report/agent.js';
import { type RunResult, countOutcomes } from '../../src/report/result.js';

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
    score: { score: 42, grade: 'F', cappedByBlocker: 'MAN-01', categories: [] },
    counts: countOutcomes(findings),
    advisory: false,
    packs: PACKS.map((pack) => ({ pack, active: true, reason: 'selected', advisory: false })),
  };
}

describe('formatAgent', () => {
  test('renders only errors and warnings as Markdown with check context', () => {
    const blocking = check({ blocking: true });
    const heuristic = check({
      id: 'RSP-03',
      category: 'Responsiveness',
      title: 'touch targets at least 44x44 on mobile',
      tier: 1,
      severity: 'warning',
      deterministic: false,
    });
    const md = formatAgent(
      runResult([
        fail(
          blocking,
          'No web app manifest found',
          'Add a manifest.webmanifest',
          'dist/index.html',
        ),
        warn(heuristic, 'Touch targets smaller than 44x44', 'Increase interactive element size'),
        pass(check({ id: 'MAN-04' })),
        skip(check({ id: 'SW-08' }), 'no-browser'),
      ]),
    );

    // Header: target, grade with blocker cap, counts.
    expect(md).toContain('# web-checks report');
    expect(md).toContain('- Target: `./dist` (mode: build)');
    expect(md).toContain('- Grade: F (42%) — capped to F by blocking check MAN-01');
    expect(md).toContain('- Outcomes: 1 errors, 1 warnings (1 passed and 1 skipped omitted');

    // Error finding: what was verified, what was found, evidence, fix, blocking.
    expect(md).toContain('## Errors');
    expect(md).toContain('### MAN-01 — Manifest present');
    expect(md).toContain('- Category: Manifest (blocking: a failure caps the grade to F)');
    expect(md).toContain(
      '- Verified: Manifest present (tier 0: static analysis of files/HTML/manifest, no browser; deterministic result)',
    );
    expect(md).toContain('- Found: No web app manifest found');
    expect(md).toContain('- Evidence: dist/index.html');
    expect(md).toContain('- Fix: Add a manifest.webmanifest');

    // Warning finding: tier 1 + heuristic wording.
    expect(md).toContain('## Warnings');
    expect(md).toContain('### RSP-03 — touch targets at least 44x44 on mobile');
    expect(md).toContain('tier 1: runtime verification in a real browser');
    expect(md).toContain('heuristic result, may vary between runs');

    // Pass/skipped findings never appear.
    expect(md).not.toContain('MAN-04');
    expect(md).not.toContain('SW-08');
    // No ANSI escape codes, ever.
    expect(md.includes(String.fromCharCode(27))).toBe(false);
  });

  test('says so explicitly when there is nothing to report', () => {
    const md = formatAgent(runResult([pass(check({}))]));
    expect(md).toContain('No errors or warnings found.');
    expect(md).not.toContain('## Errors');
    expect(md).not.toContain('## Warnings');
  });

  test('advisory (source-only) runs state that no grade was computed', () => {
    const result = runResult([]);
    result.advisory = true;
    const md = formatAgent(result);
    expect(md).toContain('- Grade: none — source-only run, advisory pre-flight (not scored)');
    expect(md).not.toContain('42%');
  });
});

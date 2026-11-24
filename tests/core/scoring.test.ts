import { describe, expect, test } from 'vitest';
import type { Category, Check, Finding, Severity } from '../../src/core/check.js';
import type { ResolvedConfig } from '../../src/core/config.js';
import { computeScore, gradeAtLeast, gradeFromScore } from '../../src/core/scoring.js';

function mkFinding(
  id: string,
  category: Category,
  severity: Severity,
  status: Finding['status'],
  blocking = false,
): Finding {
  const check: Check = {
    id,
    category,
    title: id,
    modes: ['build'],
    tier: 0,
    severity,
    deterministic: true,
    ...(blocking ? { blocking: true } : {}),
  };
  return { check, status, message: id };
}

const config = { weights: {} } as ResolvedConfig;

describe('gradeFromScore', () => {
  test.each([
    [100, 'A'],
    [95, 'A'],
    [94, 'B'],
    [85, 'B'],
    [70, 'C'],
    [55, 'D'],
    [40, 'E'],
    [39, 'F'],
    [0, 'F'],
  ])('%i -> %s', (score, grade) => {
    expect(gradeFromScore(score)).toBe(grade);
  });
});

describe('gradeAtLeast (CI gate)', () => {
  test('a grade meets itself and anything worse, never anything better', () => {
    expect(gradeAtLeast('C', 'C')).toBe(true);
    expect(gradeAtLeast('A', 'C')).toBe(true);
    expect(gradeAtLeast('D', 'C')).toBe(false);
    expect(gradeAtLeast('F', 'F')).toBe(true);
    expect(gradeAtLeast('B', 'A')).toBe(false);
  });
});

describe('computeScore', () => {
  test('all pass in one category -> 100 (single active category normalized)', () => {
    const findings = [
      mkFinding('MAN-01', 'Manifest', 'error', 'pass'),
      mkFinding('MAN-09', 'Manifest', 'warning', 'pass'),
    ];
    const r = computeScore(findings, config);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('A');
  });

  test('failed blocking check caps grade to F regardless of score', () => {
    const findings = [
      mkFinding('MAN-01', 'Manifest', 'error', 'error', true),
      // Lots of passing weight elsewhere so numeric score would be high.
      mkFinding('HTML-02', 'Html', 'error', 'pass'),
    ];
    const r = computeScore(findings, config);
    expect(r.grade).toBe('F');
    expect(r.cappedByBlocker).toBe('MAN-01');
  });

  test('info findings do not affect the score', () => {
    const findings = [
      mkFinding('MAN-01', 'Manifest', 'error', 'pass'),
      mkFinding('MAN-11', 'Manifest', 'info', 'info'),
    ];
    expect(computeScore(findings, config).score).toBe(100);
  });

  test('skipped checks are excluded and weight redistributes across active categories', () => {
    // Manifest fully passes; Installability entirely skipped -> its weight
    // redistributes, so the score stays 100.
    const findings = [
      mkFinding('MAN-01', 'Manifest', 'error', 'pass'),
      mkFinding('INST-01', 'Installability', 'error', 'skipped'),
    ];
    expect(computeScore(findings, config).score).toBe(100);
  });

  test('half the weighted checks failing yields a partial category score', () => {
    // One error (weight 3) passes, one error (weight 3) fails in the same
    // single active category -> 50%.
    const findings = [
      mkFinding('MAN-03', 'Manifest', 'error', 'pass'),
      mkFinding('MAN-05', 'Manifest', 'error', 'error'),
    ];
    expect(computeScore(findings, config).score).toBe(50);
  });
});

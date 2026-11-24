// Golden scoring tests (IMPLEMENTATION_PLAN §B.6). Expected scores are asserted
// as exact numbers: if a weight changes in the SPEC, these break and force the
// change to be intentional.

import { describe, expect, test } from 'vitest';
import { run } from '../../src/cli/run.js';
import { DEFAULT_PACKS, type Pack } from '../../src/core/packs.js';
import { fixturePath } from '../helpers/run.js';

async function grade(fixture: string, packs?: Pack[]) {
  const result = await run({
    targets: [fixturePath(fixture)],
    modes: ['build'],
    logLevel: 'error',
    ...(packs ? { packs } : {}),
  });
  return result;
}

describe('golden fixtures — exact scores', () => {
  test('golden-A (complete PWA) → 100 / A', async () => {
    const r = await grade('manifest-ok');
    expect(r.score.score).toBe(100);
    expect(r.score.grade).toBe('A');
    expect(r.score.cappedByBlocker).toBeUndefined();
  });

  test('golden-degraded (2 errors + 4 warnings) → 89 / B', async () => {
    const r = await grade('golden-degraded');
    expect(r.score.score).toBe(89);
    expect(r.score.grade).toBe('B');
  });

  test('golden-A and golden-degraded detect the PWA: pwa pack active and graded', async () => {
    const ok = await grade('manifest-ok');
    expect(ok.packs.find((p) => p.pack === 'pwa')).toMatchObject({
      active: true,
      reason: 'detected',
    });
    const degraded = await grade('golden-degraded');
    expect(degraded.packs.find((p) => p.pack === 'pwa')?.score?.score).toBe(86);
    expect(degraded.packs.find((p) => p.pack === 'head')?.score?.score).toBe(100);
  });

  test('golden-blocker (no manifest, pwa pack forced) → F, capped by a blocking check', async () => {
    const r = await grade('manifest-missing', [...DEFAULT_PACKS, 'pwa']);
    expect(r.score.grade).toBe('F');
    expect(r.score.cappedByBlocker).toBeDefined();
    expect(r.packs.find((p) => p.pack === 'pwa')?.score?.grade).toBe('F');
  });

  test('no manifest and default packs: not a PWA, graded on head and responsive → 100 / A', async () => {
    const r = await grade('manifest-missing');
    expect(r.score.score).toBe(100);
    expect(r.score.grade).toBe('A');
    expect(r.packs.find((p) => p.pack === 'pwa')).toMatchObject({
      active: false,
      reason: 'not-detected',
    });
    expect(r.findings.some((f) => f.check.id.startsWith('MAN-'))).toBe(false);
  });

  test('skip counting in build: SRC-* (mode) and RSP Tier 1 (no-browser)', async () => {
    const r = await grade('manifest-ok');
    const skipped = r.findings.filter((f) => f.status === 'skipped');
    const ids = new Set(skipped.map((f) => f.check.id));
    // source-only smoke checks skip on mode
    for (const id of ['SRC-01', 'SRC-02', 'SRC-03']) {
      expect(ids.has(id)).toBe(true);
      expect(r.findings.find((f) => f.check.id === id)?.skipReason).toBe('mode');
    }
    // live-only Tier 1 responsive checks are not applicable in build → mode skip
    expect(r.findings.find((f) => f.check.id === 'RSP-02')?.skipReason).toBe('mode');
  });
});

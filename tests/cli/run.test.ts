import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { BrowserUnavailableError, ConfigError, run } from '../../src/cli/run.js';
import { DEFAULT_PACKS, type Pack } from '../../src/core/packs.js';
import { formatAgent } from '../../src/report/agent.js';
import { formatText } from '../../src/report/text.js';

async function buildDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pwa-run-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>demo</title>');
  return dir;
}

const WITH_PWA: Pack[] = [...DEFAULT_PACKS, 'pwa'];

describe('run (end-to-end)', () => {
  test('runs to completion and produces a RunResult', async () => {
    const dir = await buildDir();
    const result = await run({ targets: [dir], modes: ['build'], logLevel: 'error' });
    expect(result.targets).toEqual([
      expect.objectContaining({ mode: 'build', target: expect.any(String) }),
    ]);
    // No manifest: not a PWA, so the pwa pack stays off and no MAN-* is reported;
    // the page is graded on head/responsive (no viewport, no charset -> F).
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.check.id.startsWith('MAN-'))).toBe(false);
    expect(result.packs.find((p) => p.pack === 'pwa')).toMatchObject({
      active: false,
      reason: 'not-detected',
    });
    expect(result.findings.find((f) => f.check.id === 'HTML-02')?.status).toBe('error');
    expect(result.score.cappedByBlocker).toBeUndefined();
  });

  test('--pack pwa forces the PWA checks: MAN-01 fails and caps the grade', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      packs: WITH_PWA,
    });
    // MAN-01 fails (blocking) and MAN-02..15 cascade to skipped(dependency).
    expect(result.findings.find((f) => f.check.id === 'MAN-01')?.status).toBe('error');
    expect(result.score.grade).toBe('F');
    expect(result.score.cappedByBlocker).toBe('MAN-01');
  });

  test('text formatter renders a deterministic header with no color', async () => {
    const dir = await buildDir();
    const result = await run({ targets: [dir], modes: ['build'], logLevel: 'error' });
    const text = formatText(result, { noColor: true });
    expect(text).toContain('WEB CHECKS');
    expect(text).toContain('PACKS');
    expect(text).toMatch(/pwa\s+not active: no web app manifest/);
    expect(text).toContain('GRADE:');
    expect(text).toContain('passed');
    // No ANSI escape codes (ESC, char code 27) when color is disabled.
    expect(text.includes(String.fromCharCode(27))).toBe(false);
  });

  test('agent formatter renders Markdown with errors/warnings only on a real run', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      packs: WITH_PWA,
    });
    const md = formatAgent(result);
    expect(md).toContain('  - pwa: F (');
    // MAN-01 fails on the manifest-less demo dir and is blocking.
    expect(md).toContain('## Errors');
    expect(md).toContain('### MAN-01 — Manifest present');
    expect(md).toContain('- Fix: ');
    // Skipped cascade (MAN-02..15) must not leak into the agent report.
    expect(md).not.toContain('MAN-02');
    expect(md.includes(String.fromCharCode(27))).toBe(false);
  });

  test('CI gate fails when the grade is below --fail-below-grade', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      failBelowGrade: 'C',
    });
    expect(result.score.grade).toBe('F');
    expect(result.gate).toEqual({ failBelowGrade: 'C', passed: false });
  });

  test('CI gate passes when the grade meets the threshold', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      failBelowGrade: 'F',
    });
    expect(result.gate).toEqual({ failBelowGrade: 'F', passed: true });
  });

  test('CI gate is absent when not enabled', async () => {
    const dir = await buildDir();
    const result = await run({ targets: [dir], modes: ['build'], logLevel: 'error' });
    expect(result.gate).toBeUndefined();
  });

  test('text and agent formatters surface the CI gate outcome', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      failBelowGrade: 'C',
    });
    expect(formatText(result, { noColor: true })).toContain('CI GATE: failed (fail below grade C)');
    expect(formatAgent(result)).toContain('- CI gate: failed (fail below grade C)');
  });

  test('--only selects checks by id; dependencies run but are not listed', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      only: ['MAN-03'],
    });
    expect(result.findings.map((f) => f.check.id)).toEqual(['MAN-03']);
    // MAN-01/02 ran as dependencies: MAN-03 is skipped because they did not pass.
    expect(result.findings[0]?.skipReason).toBe('dependency');
    expect(result.packs.filter((p) => p.active).map((p) => p.pack)).toEqual(['pwa']);
  });

  test('--only with no matching check is a usage error', async () => {
    const dir = await buildDir();
    await expect(
      run({ targets: [dir], modes: ['build'], logLevel: 'error', only: ['NOPE-*'] }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  test('advisory packs only: no scored outcome, so no grade and the CI gate passes', async () => {
    const dir = await buildDir();
    const result = await run({
      targets: [dir],
      modes: ['build'],
      logLevel: 'error',
      packs: ['perf', 'compat'],
      failBelowGrade: 'A',
    });
    expect(result.advisory).toBe(true);
    expect(result.advisoryReason).toBe('no-scored-checks');
    expect(result.gate?.passed).toBe(true);
    expect(formatText(result, { noColor: true })).toContain('NO GRADE');
  });

  test('a source folder with a PWA plugin activates the pwa pack', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'web-src-'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { 'vite-plugin-pwa': '^1.0.0' } }),
    );
    const result = await run({ targets: [dir], modes: ['source'], logLevel: 'error' });
    expect(result.packs.find((p) => p.pack === 'pwa')).toMatchObject({
      active: true,
      reason: 'detected',
      evidence: 'PWA plugin vite-plugin-pwa in package.json',
    });
  });
});

describe('BrowserUnavailableError', () => {
  test('explains the reason and the --no-browser way out', () => {
    const err = new BrowserUnavailableError('the playwright package is not installed');
    expect(err.message).toContain('the playwright package is not installed');
    expect(err.message).toContain('--no-browser');
  });
});

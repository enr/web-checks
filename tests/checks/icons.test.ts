import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('ICO-01/02 required sizes', () => {
  test('192 pass when declared with purpose any and file exists', async () => {
    expect((await runSingleCheck('manifest-ok', 'ICO-01')).status).toBe('pass');
  });
  test('512 pass on a complete PWA', async () => {
    expect((await runSingleCheck('manifest-ok', 'ICO-02')).status).toBe('pass');
  });
  test('error (blocking) when the declared icon file is missing', async () => {
    const f = await runSingleCheck('manifest-no-name', 'ICO-01');
    expect(f.status).toBe('error');
    expect(f.check.blocking).toBe(true);
  });
});

describe('ICO-04 maskable', () => {
  test('pass when a maskable icon exists', async () => {
    expect((await runSingleCheck('manifest-ok', 'ICO-04')).status).toBe('pass');
  });
  test('warning when no maskable icon', async () => {
    expect((await runSingleCheck('manifest-missing-theme', 'ICO-04')).status).toBe('warning');
  });
});

describe('ICO-06 apple-touch-icon', () => {
  test('pass on a 180x180 PNG', async () => {
    expect((await runSingleCheck('manifest-ok', 'ICO-06')).status).toBe('pass');
  });
  test('skipped(dependency) when HTML-05 is absent', async () => {
    const f = await runSingleCheck('manifest-missing-theme', 'ICO-06');
    expect(f.status).toBe('skipped');
    expect(f.skipReason).toBe('dependency');
  });
});

describe('ICO-07 real dimensions', () => {
  test('pass when declared sizes match real pixels', async () => {
    expect((await runSingleCheck('manifest-ok', 'ICO-07')).status).toBe('pass');
  });
  test('warning when a declared size does not match the file', async () => {
    const f = await runSingleCheck('icons-wrong-size', 'ICO-07');
    expect(f.status).toBe('warning');
    expect(f.evidence).toContain('100x100');
  });
});

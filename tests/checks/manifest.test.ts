import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('MAN-01 present', () => {
  test('pass on a linked manifest', async () => {
    const f = await runSingleCheck('manifest-ok', 'MAN-01');
    expect(f.status).toBe('pass');
  });
  test('pass at a conventional path when not linked', async () => {
    const f = await runSingleCheck('manifest-conventional', 'MAN-01');
    expect(f.status).toBe('pass');
  });
  test('error (blocking) when no manifest exists', async () => {
    const f = await runSingleCheck('manifest-missing', 'MAN-01');
    expect(f.status).toBe('error');
    expect(f.check.blocking).toBe(true);
  });
});

describe('MAN-02 validity', () => {
  test('pass on valid manifest', async () => {
    expect((await runSingleCheck('manifest-ok', 'MAN-02')).status).toBe('pass');
  });
  test('error on invalid JSON', async () => {
    expect((await runSingleCheck('manifest-invalid-json', 'MAN-02')).status).toBe('error');
  });
  test('error on duplicate keys', async () => {
    const f = await runSingleCheck('manifest-duplicate-keys', 'MAN-02');
    expect(f.status).toBe('error');
    expect(f.evidence).toContain('name');
  });
  test('skipped(dependency) when manifest is missing', async () => {
    const f = await runSingleCheck('manifest-missing', 'MAN-02');
    expect(f.status).toBe('skipped');
    expect(f.skipReason).toBe('dependency');
  });
});

describe('MAN-03 name', () => {
  test('pass when name present', async () => {
    expect((await runSingleCheck('manifest-ok', 'MAN-03')).status).toBe('pass');
  });
  test('error when name missing', async () => {
    const f = await runSingleCheck('manifest-no-name', 'MAN-03');
    expect(f.status).toBe('error');
    expect(f.fix).toBeTruthy();
  });
  test('skipped(dependency) when JSON invalid', async () => {
    const f = await runSingleCheck('manifest-invalid-json', 'MAN-03');
    expect(f.status).toBe('skipped');
    expect(f.skipReason).toBe('dependency');
  });
});

describe('MAN-05 start_url', () => {
  test('pass when start_url resolves (SPA index fallback)', async () => {
    expect((await runSingleCheck('manifest-ok', 'MAN-05')).status).toBe('pass');
  });
});

describe('MAN-07 icons', () => {
  test('pass on a well-formed icons array', async () => {
    expect((await runSingleCheck('manifest-ok', 'MAN-07')).status).toBe('pass');
  });
});

describe('MAN-09 theme_color', () => {
  test('pass when present', async () => {
    expect((await runSingleCheck('manifest-ok', 'MAN-09')).status).toBe('pass');
  });
  test('warning when missing', async () => {
    const f = await runSingleCheck('manifest-missing-theme', 'MAN-09');
    expect(f.status).toBe('warning');
    expect(f.fix).toBeTruthy();
  });
});

describe('MAN-16 screenshots', () => {
  test('pass with wide + narrow form factors', async () => {
    const f = await runSingleCheck('manifest-screenshots', 'MAN-16');
    expect(f.status).toBe('pass');
    expect(f.evidence).toContain('wide + narrow');
  });
  test('info when screenshots are missing', async () => {
    const f = await runSingleCheck('manifest-ok', 'MAN-16');
    expect(f.status).toBe('info');
    expect(f.fix).toBeTruthy();
  });
  test('info when only one form factor is covered', async () => {
    const f = await runSingleCheck('manifest-screenshots-partial', 'MAN-16');
    expect(f.status).toBe('info');
    expect(f.evidence).toContain('narrow');
  });
  test('skipped(dependency) when JSON invalid', async () => {
    const f = await runSingleCheck('manifest-invalid-json', 'MAN-16');
    expect(f.status).toBe('skipped');
    expect(f.skipReason).toBe('dependency');
  });
});

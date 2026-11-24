import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('HTML-01 manifest link', () => {
  test('pass when the tag is present', async () => {
    expect((await runSingleCheck('manifest-ok', 'HTML-01')).status).toBe('pass');
  });
  test('error when tag missing but file exists at a conventional path', async () => {
    const f = await runSingleCheck('manifest-conventional', 'HTML-01');
    expect(f.status).toBe('error');
  });
  test('skipped(dependency) when neither tag nor file exist', async () => {
    const f = await runSingleCheck('manifest-missing', 'HTML-01');
    expect(f.status).toBe('skipped');
    expect(f.skipReason).toBe('dependency');
  });
});

describe('HTML-02 viewport', () => {
  test('pass on width=device-width', async () => {
    expect((await runSingleCheck('manifest-ok', 'HTML-02')).status).toBe('pass');
  });
  test('error when missing', async () => {
    expect((await runSingleCheck('html-bare', 'HTML-02')).status).toBe('error');
  });
});

describe('HTML-03/04/05 warnings', () => {
  test('theme-color present -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'HTML-03')).status).toBe('pass');
  });
  test('theme-color missing -> warning', async () => {
    expect((await runSingleCheck('html-bare', 'HTML-03')).status).toBe('warning');
  });
  test('charset missing -> warning', async () => {
    expect((await runSingleCheck('html-bare', 'HTML-04')).status).toBe('warning');
  });
  test('apple-touch-icon missing -> warning', async () => {
    expect((await runSingleCheck('html-bare', 'HTML-05')).status).toBe('warning');
  });
});

describe('HTML-06/07 info', () => {
  test('title+description present -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'HTML-06')).status).toBe('pass');
  });
  test('web-app-capable present -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'HTML-07')).status).toBe('pass');
  });
  test('web-app-capable missing -> info', async () => {
    expect((await runSingleCheck('html-bare', 'HTML-07')).status).toBe('info');
  });
});

describe('HTML-08 iOS splash screens', () => {
  test('pass with portrait + landscape startup images', async () => {
    const f = await runSingleCheck('manifest-screenshots', 'HTML-08');
    expect(f.status).toBe('pass');
    expect(f.evidence).toContain('portrait + landscape');
  });
  test('info when startup images are missing', async () => {
    const f = await runSingleCheck('html-bare', 'HTML-08');
    expect(f.status).toBe('info');
    expect(f.fix).toBeTruthy();
  });
});

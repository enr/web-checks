import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('UX advisory checks', () => {
  test('UX-01 theme_color consistent (manifest == meta) -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'UX-01')).status).toBe('pass');
  });
  test('UX-02 installable display -> pass', async () => {
    expect((await runSingleCheck('manifest-ok', 'UX-02')).status).toBe('pass');
  });
  test('UX-04 no shortcuts -> info', async () => {
    expect((await runSingleCheck('manifest-ok', 'UX-04')).status).toBe('info');
  });
  test('UX-05 perceived-performance hints (apple-touch preload absent) -> info', async () => {
    // manifest-ok has no preload/lazy/skeleton -> advisory info.
    expect((await runSingleCheck('manifest-ok', 'UX-05')).status).toBe('info');
  });
});

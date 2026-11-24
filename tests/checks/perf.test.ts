import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('PERF static (advisory)', () => {
  test('PERF-01 within budget on a tiny fixture', async () => {
    expect((await runSingleCheck('manifest-ok', 'PERF-01')).status).toBe('pass');
  });
  test('PERF-02 no render-blocking (script is at end of body)', async () => {
    expect((await runSingleCheck('manifest-ok', 'PERF-02')).status).toBe('pass');
  });
  test('PERF-03 passes when there are no images', async () => {
    expect((await runSingleCheck('manifest-ok', 'PERF-03')).status).toBe('pass');
  });
  test('PERF-04 info when no preconnect/preload hints', async () => {
    expect((await runSingleCheck('manifest-ok', 'PERF-04')).status).toBe('info');
  });
  test('PERF-05 pass when no source maps served', async () => {
    expect((await runSingleCheck('manifest-ok', 'PERF-05')).status).toBe('pass');
  });
  test('PERF-06 info when assets are not content-hashed', async () => {
    expect((await runSingleCheck('manifest-ok', 'PERF-06')).status).toBe('info');
  });
});

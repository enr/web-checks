import { describe, expect, test } from 'vitest';
import { runSingleCheck } from '../helpers/run.js';

describe('Modern APIs / Compatibility (advisory)', () => {
  test('MOD-06 shortcuts not detected on the golden fixture -> info', async () => {
    const f = await runSingleCheck('manifest-ok', 'MOD-06');
    expect(f.status).toBe('info');
    expect(f.message).toContain('not detected');
  });

  test('COMPAT-01 reports notes when a manifest and SW are present', async () => {
    const f = await runSingleCheck('manifest-ok', 'COMPAT-01');
    expect(f.status).toBe('info');
    expect(f.evidence).toContain('iOS Safari');
  });

  test('MOD-07 detects push + notificationclick handlers in the SW', async () => {
    const f = await runSingleCheck('sw-push', 'MOD-07');
    expect(f.status).toBe('info');
    expect(f.message).toContain('detected');
    expect(f.message).toContain('push handler: yes');
    expect(f.message).toContain('notificationclick: yes');
  });

  test('MOD-07 not detected when the SW has no push handlers', async () => {
    const f = await runSingleCheck('manifest-ok', 'MOD-07');
    expect(f.status).toBe('info');
    expect(f.message).toContain('not detected');
  });
});

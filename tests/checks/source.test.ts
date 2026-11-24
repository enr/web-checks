import { describe, expect, test } from 'vitest';
import { run } from '../../src/cli/run.js';
import { fixturePath, runSingleCheck } from '../helpers/run.js';

describe('SRC-01..03 smoke checks (source mode)', () => {
  test('SRC-01 finds a static manifest under public/', async () => {
    const f = await runSingleCheck('source-pwa', 'SRC-01', { mode: 'source' });
    expect(f.status).toBe('pass');
    expect(f.evidence).toContain('manifest');
  });
  test('SRC-02 detects a PWA plugin in package.json', async () => {
    const f = await runSingleCheck('source-pwa', 'SRC-02', { mode: 'source' });
    expect(f.status).toBe('pass');
    expect(f.evidence).toContain('vite-plugin-pwa');
  });
  test('SRC-03 finds the register call in source', async () => {
    const f = await runSingleCheck('source-pwa', 'SRC-03', { mode: 'source' });
    expect(f.status).toBe('pass');
  });
});

describe('source run is advisory and not scored', () => {
  test('run auto-detects source and marks the result advisory', async () => {
    const result = await run({ targets: [fixturePath('source-pwa')], logLevel: 'error' });
    expect(result.targets[0]?.mode).toBe('source');
    expect(result.advisory).toBe(true);
    // Scored categories must not contribute: Manifest checks are demoted to
    // advisory-preflight skips, so there are no error/warning scored outcomes.
    const scored = result.findings.filter((f) => f.status === 'error' || f.status === 'warning');
    expect(scored).toHaveLength(0);
    // SRC-* smoke checks are present as real (pass) outcomes.
    expect(result.findings.find((f) => f.check.id === 'SRC-01')?.status).toBe('pass');
  });
});

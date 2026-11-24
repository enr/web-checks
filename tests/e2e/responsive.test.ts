import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { run } from '../../src/cli/run.js';
import type { Finding } from '../../src/core/check.js';
import { runLive } from '../helpers/live.js';
import { fixturePath, runSingleCheck } from '../helpers/run.js';
import { type StaticServer, startStaticServer } from '../helpers/server.js';

describe('RSP Tier 0 (static)', () => {
  test('RSP-01 warns when zoom is disabled (user-scalable=no)', async () => {
    // responsive-broken has user-scalable=no in the viewport meta.
    const f = await runSingleCheck('responsive-broken', 'RSP-01');
    expect(f.status).toBe('warning');
  });
  test('RSP-01 passes on a normal viewport', async () => {
    expect((await runSingleCheck('manifest-ok', 'RSP-01')).status).toBe('pass');
  });
  test('RSP-05 detects media queries in inline CSS', async () => {
    expect((await runSingleCheck('responsive-ok', 'RSP-05')).status).toBe('pass');
  });
});

describe('RSP Tier 1 (live, Playwright)', () => {
  let okServer: StaticServer;
  let brokenServer: StaticServer;

  beforeAll(async () => {
    okServer = await startStaticServer(fixturePath('responsive-ok'));
    brokenServer = await startStaticServer(fixturePath('responsive-broken'));
  });
  afterAll(async () => {
    await okServer?.close();
    await brokenServer?.close();
  });

  const byId = (findings: Finding[], id: string) => findings.find((f) => f.check.id === id);

  test('a well-built responsive page passes the scored RSP checks', async () => {
    const result = await runLive({ targets: [okServer.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(byId(result.findings, 'RSP-02')?.status).toBe('pass'); // no overflow
    expect(byId(result.findings, 'RSP-07')?.status).toBe('pass'); // media scales
    expect(byId(result.findings, 'RSP-11')?.status).toBe('pass'); // reflow
  }, 45000);

  test('a broken page fails overflow / media / touch-target checks', async () => {
    const result = await runLive({ targets: [brokenServer.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(byId(result.findings, 'RSP-02')?.status).toBe('warning'); // 2000px div overflows
    expect(byId(result.findings, 'RSP-07')?.status).toBe('warning'); // 3000px image
    const rsp03 = byId(result.findings, 'RSP-03');
    expect(rsp03?.status).toBe('warning'); // 20x20 button on mobile
  }, 45000);

  test('live run without a browser skips Tier 1 checks (no-browser)', async () => {
    const result = await run({ targets: [okServer.url], logLevel: 'error', noBrowser: true });
    const rsp02 = byId(result.findings, 'RSP-02');
    expect(rsp02?.status).toBe('skipped');
    expect(rsp02?.skipReason).toBe('no-browser');
  }, 20000);
});

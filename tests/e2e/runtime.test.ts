import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Finding } from '../../src/core/check.js';
import { runLive } from '../helpers/live.js';
import { fixturePath } from '../helpers/run.js';
import { type StaticServer, startStaticServer } from '../helpers/server.js';

const byId = (findings: Finding[], id: string) => findings.find((f) => f.check.id === id);

describe('RUN-* runtime health (live)', () => {
  let okServer: StaticServer;
  let brokenServer: StaticServer;

  beforeAll(async () => {
    okServer = await startStaticServer(fixturePath('manifest-ok'));
    brokenServer = await startStaticServer(fixturePath('runtime-broken'));
  });
  afterAll(async () => {
    await okServer?.close();
    await brokenServer?.close();
  });

  test('a clean page passes the scored RUN checks', async () => {
    const result = await runLive({ targets: [okServer.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(byId(result.findings, 'RUN-01')?.status).toBe('pass');
    expect(byId(result.findings, 'RUN-03')?.status).toBe('pass');
  }, 45000);

  test('a page with a broken asset and a console error fails RUN-01 / RUN-04', async () => {
    const result = await runLive({ targets: [brokenServer.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(byId(result.findings, 'RUN-01')?.status).toBe('warning'); // 404 asset
    expect(byId(result.findings, 'RUN-04')?.status).toBe('info'); // console error
  }, 45000);

  test('a live page without a manifest is not a PWA: no PWA check runs or is graded', async () => {
    const result = await runLive({ targets: [brokenServer.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(result.packs.find((p) => p.pack === 'pwa')).toMatchObject({
      active: false,
      reason: 'not-detected',
    });
    expect(
      result.findings.some((f) => /^(MAN|ICO|SW|OFF|INST|RUN-02|RUN-03)/.test(f.check.id)),
    ).toBe(false);
    expect(result.score.cappedByBlocker).toBeUndefined();
    expect(result.packs.find((p) => p.pack === 'runtime')?.score?.grade).toBeDefined();
  }, 45000);

  test('a live PWA is detected from its <link rel="manifest">', async () => {
    const result = await runLive({ targets: [okServer.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(result.packs.find((p) => p.pack === 'pwa')).toMatchObject({
      active: true,
      reason: 'detected',
      evidence: '<link rel="manifest" href="/manifest.webmanifest">',
    });
  }, 45000);
});

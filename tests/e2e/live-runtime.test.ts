import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Finding } from '../../src/core/check.js';
import { runLive } from '../helpers/live.js';
import { fixturePath } from '../helpers/run.js';
import { type StaticServer, startStaticServer } from '../helpers/server.js';

const byId = (findings: Finding[], id: string) => findings.find((f) => f.check.id === id);

describe('live installability / SW runtime / offline', () => {
  let server: StaticServer;

  beforeAll(async () => {
    server = await startStaticServer(fixturePath('manifest-ok'));
  });
  afterAll(async () => {
    await server?.close();
  });

  test('INST-01 passes on localhost', async () => {
    const result = await runLive({ targets: [server.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(byId(result.findings, 'INST-01')?.status).toBe('pass');
  }, 45000);

  test('SW-08 sees the Service Worker activate and OFF-02 serves offline', async () => {
    const result = await runLive({ targets: [server.url], logLevel: 'error' });
    if (!result) return; // no browser
    expect(byId(result.findings, 'SW-08')?.status).toBe('pass');
    expect(byId(result.findings, 'OFF-02')?.status).toBe('pass');
  }, 60000);
});

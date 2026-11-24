// Exit codes are part of the contract shared with the poqa tools
// (effective-train docs/poqa-findings.md §Exit codes): 0 ok, 1 usage,
// 2 CI gate, 3 target/browser/fatal.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { fixturePath } from '../helpers/run.js';
import { startStaticServer } from '../helpers/server.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

function cli(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
    timeout: 60000,
  });
}

/** cli() without blocking the event loop (the test serves the target itself). */
function cliAsync(...args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

/** A local port nothing listens on: bind an ephemeral one, then free it. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  await new Promise<void>((r) => server.close(() => r()));
  if (address === null || typeof address === 'string') throw new Error('no port');
  return address.port;
}

describe('exit codes', () => {
  test('0 when the run completes', () => {
    expect(cli('tests/fixtures/manifest-ok', '--mode', 'build').status).toBe(0);
  });

  test('1 on a usage error', () => {
    expect(cli('--bogus').status).toBe(1);
    expect(cli('tests/fixtures/manifest-ok', '-q', '-v').status).toBe(1);
    expect(cli('tests/fixtures/manifest-ok', '--fail-below-grade', 'Z').status).toBe(1);
    expect(cli('tests/fixtures/manifest-ok', '--format', 'xml').status).toBe(1);
    expect(cli().status).toBe(1);
    expect(cli('auth').status).toBe(1);
    expect(cli('auth', 'replay').status).toBe(1);
    expect(cli('auth', 'record').status).toBe(1);
    expect(cli('auth', 'record', './not-a-url').status).toBe(1);
    expect(cli('auth', 'record', 'https://a.example', '--http-user', 'u').status).toBe(1);
  });

  test('2 when the CI gate fails', () => {
    const r = cli(
      'tests/fixtures/manifest-missing',
      '--mode',
      'build',
      '--pack',
      'pwa',
      '--fail-below-grade',
      'A',
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('CI gate crossed');
  });

  test('a run without a gate flag exits 0 whatever the grade', () => {
    const r = cli('tests/fixtures/manifest-missing', '--mode', 'build', '--pack', 'pwa');
    expect(r.status).toBe(0);
  });

  test.runIf(process.platform === 'linux')('3 when auth record has no display', () => {
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/cli/index.ts', 'auth', 'record', 'https://a.example'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' },
        input: '',
      },
    );
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('needs a visible browser');
  });

  test('3 when the recorded session no longer opens the app', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wc-exit-'));
    const state = join(dir, 'state.json');
    await writeFile(state, JSON.stringify({ cookies: [], origins: [] }));
    const server = await startStaticServer(fixturePath('auth-session'));
    try {
      const r = await cliAsync(`${server.url}/`, '--auth-state', state, '--pack', 'runtime');
      expect(r.status).toBe(3);
      expect(r.stderr).toMatch(/auth failed \/ expired|browser/);
    } finally {
      await server.close();
    }
  }, 60000);

  test('3 when a live target does not answer', async () => {
    const r = cli(`http://127.0.0.1:${await closedPort()}/`, '--no-browser', '--format', 'poqa');
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('is unreachable');
    expect(r.stdout).toBe('');
  });
}, 60_000);

describe('flags shared with the poqa tools', () => {
  test('-V prints the version, -h the help', () => {
    const v = cli('-V');
    expect(v.status).toBe(0);
    expect(v.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(cli('-h').stdout).toContain('--fail-below-grade');
  });

  test('-o writes the report to a file instead of stdout', async () => {
    const { mkdtemp, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const out = join(await mkdtemp(join(tmpdir(), 'wc-')), 'report.json');
    const r = cli('tests/fixtures/manifest-ok', '--mode', 'build', '--format', 'poqa', '-o', out);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(JSON.parse(await readFile(out, 'utf8')).schema).toBe('poqa-findings/v1');
    expect(cli('tests/fixtures/manifest-ok', '--mode', 'build', '-q', '-o', out).stderr).toBe('');
  });
}, 60_000);

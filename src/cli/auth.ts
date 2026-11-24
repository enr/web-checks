// `web-checks auth <command>`: session management for live runs.
//   record  open a visible browser, log in by hand, save the session.

import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { expandPlaceholders } from '../auth/context.js';
import { recordSession } from '../auth/record.js';
import { launchDriver } from '../browser/playwright.js';
import { ConsoleLogger, SecretRegistry } from '../core/logger.js';

export const AUTH_USAGE = `web-checks auth record — log in by hand and save the session

Usage:
  web-checks auth record <url> [options]

Opens a visible browser on <url>. Log in as you normally would (OAuth/OIDC,
SAML, MFA, passkeys: any flow works, nothing is scripted), then press Enter
in this terminal with the browser still open. The session (cookies,
localStorage, IndexedDB, sessionStorage) is saved to a file that live runs
load with --auth-state <file>; when it expires, the run stops with
"auth failed / expired" and you record it again.

The file grants access to the account: keep it out of version control. In CI,
store it as a secret and write it to disk before the run.

Options:
  -o, --output <file>     Where to save the session
                          (default: web-checks.auth-state.json).
  --ready-url <glob>      Save as soon as the URL matches (e.g. "**/dashboard"),
                          without waiting for Enter.
  --ready-selector <css>  Save as soon as this element is visible.
  --http-user <user>      HTTP Basic credentials, when a proxy asks for them;
  --http-password <pass>  {{env.X}} / {{secret.X}} are expanded.
  --timeout <ms>          Time allowed for the login (default 600000).
  -v, --verbose           Also print debug messages on stderr.
  -h, --help              Show this help.
`;

const EXIT = { ok: 0, usage: 1, fatal: 3 } as const;

const NO_DISPLAY =
  'auth record needs a visible browser and there is no display (DISPLAY / WAYLAND_DISPLAY). Run it on your own machine, then copy the session file where the checks run.';

export const DEFAULT_AUTH_STATE_FILE = 'web-checks.auth-state.json';

export async function authMain(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
    process.stdout.write(AUTH_USAGE);
    return command === undefined ? EXIT.usage : EXIT.ok;
  }
  if (command !== 'record') {
    process.stderr.write(`error: unknown auth command "${command}" (expected: record)\n`);
    return EXIT.usage;
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        output: { type: 'string', short: 'o' },
        'ready-url': { type: 'string' },
        'ready-selector': { type: 'string' },
        'http-user': { type: 'string' },
        'http-password': { type: 'string' },
        timeout: { type: 'string' },
        verbose: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return EXIT.usage;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(AUTH_USAGE);
    return EXIT.ok;
  }
  const url = positionals[0];
  if (positionals.length !== 1 || url === undefined || !/^https?:\/\//.test(url)) {
    process.stderr.write('error: auth record needs exactly one http(s) URL\n\n');
    process.stderr.write(AUTH_USAGE);
    return EXIT.usage;
  }
  let timeoutMs: number | undefined;
  if (values.timeout !== undefined) {
    timeoutMs = Number(values.timeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      process.stderr.write(
        `error: invalid --timeout "${values.timeout}" (expected a positive integer in ms)\n`,
      );
      return EXIT.usage;
    }
  }
  const httpUser = values['http-user'] as string | undefined;
  const httpPassword = values['http-password'] as string | undefined;
  if ((httpUser === undefined) !== (httpPassword === undefined)) {
    process.stderr.write('error: --http-user and --http-password go together\n');
    return EXIT.usage;
  }

  const secrets = new SecretRegistry();
  const log = new ConsoleLogger(secrets, values.verbose ? 'debug' : 'info');
  const output = (values.output as string | undefined) ?? DEFAULT_AUTH_STATE_FILE;
  const readyUrl = values['ready-url'] as string | undefined;
  const readySelector = values['ready-selector'] as string | undefined;

  // Without a display, Chromium may still start (headless shell) and the
  // command would wait for a login nobody can see.
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    process.stderr.write(`error: ${NO_DISPLAY}\n`);
    return EXIT.fatal;
  }
  const launched = await launchDriver({ headless: false });
  if (!launched.driver) {
    process.stderr.write(`error: ${launched.reason}.\n`);
    return EXIT.fatal;
  }

  const stdin = createInterface({ input: process.stdin, output: process.stderr });
  const confirm = (): Promise<void> =>
    new Promise((resolve, reject) => {
      // Ctrl+D / Ctrl+C / no terminal: give up instead of waiting forever.
      stdin.once('close', () => reject(new Error('cancelled: the terminal input was closed')));
      stdin.question(
        `Log in in the browser window, then press Enter here to save the session${readyUrl || readySelector ? ' (or wait: it is saved as soon as the ready condition holds)' : ''}.\n`,
        () => resolve(),
      );
    });

  try {
    const result = await recordSession({
      url,
      output,
      driver: launched.driver,
      log,
      confirm,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(readyUrl || readySelector
        ? {
            ready: {
              ...(readyUrl ? { url: readyUrl } : {}),
              ...(readySelector ? { selector: readySelector } : {}),
            },
          }
        : {}),
      ...(httpUser !== undefined && httpPassword !== undefined
        ? {
            httpCredentials: {
              username: expandPlaceholders(httpUser, secrets),
              password: expandPlaceholders(httpPassword, secrets),
            },
          }
        : {}),
    });
    process.stderr.write(
      `Saved the session → ${result.output} (${result.cookies} cookies, ${result.origins} origins with storage, ${result.sessionStorage} sessionStorage entries, ${result.indexedDB} IndexedDB databases).\n`,
    );
    process.stderr.write(`Use it with: web-checks ${url} --auth-state ${result.output}\n`);
    process.stderr.write('It grants access to the account: keep it out of version control.\n');
    return EXIT.ok;
  } catch (err) {
    process.stderr.write(`error: ${secrets.redact((err as Error).message)}\n`);
    return EXIT.fatal;
  } finally {
    stdin.close();
    await launched.driver.close();
  }
}

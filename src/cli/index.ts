// CLI entrypoint: argument parsing (node:util parseArgs — zero-dep, §A.8),
// orchestration and exit codes (SPEC §"Exit code (v1)").

import { rename, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { AuthError } from '../auth/dsl.js';
import type { Grade } from '../core/check.js';
import { DEFAULT_AUTH_CACHE_TTL_MS } from '../core/config.js';
import { ModeError, parseModeFlag } from '../core/modes.js';
import { PACKS, type Pack, isPack } from '../core/packs.js';
import { formatAgent } from '../report/agent.js';
import { formatJson } from '../report/json.js';
import { formatPoqa } from '../report/poqa.js';
import { formatText } from '../report/text.js';
import { VERSION } from '../version.js';
import { authMain } from './auth.js';
import { BrowserUnavailableError, ConfigError, TargetUnreachableError, run } from './run.js';

const USAGE = `web-checks — checks for web applications in the browser:
runtime health, responsive layout and Progressive Web App best practices

Usage:
  web-checks <target...> [options]
  web-checks auth record <url> [options]   log in by hand, save the session

Targets:
  A folder (source/build) or an URL (live). Multiple targets combine modes,
  one per mode; the mode of each is auto-detected unless --mode forces it.

Options:
  --mode <list>    Comma-separated modes (source|build|live), matched to targets
                   in order. Two targets on the same mode is an error.
  --config <path>  Path to a config file (else web-checks.config.{json,js,mjs}).
  --pack <list>    Comma-separated packs to run, replacing the defaults:
                   runtime, responsive, head, pwa, perf, compat, modern.
                   Default: all but pwa, plus pwa when the target has a web
                   app manifest.
  --only <list>    Comma-separated check ids to run instead of packs; * is a
                   wildcard (RUN-*,MAN-01). Dependencies run but are not listed.
  --no-browser     Do not launch a browser: browser (Tier 1) checks are
                   skipped. Without it, a live run that needs the browser
                   fails (exit 3) when the browser cannot start.
  --auth <path>    Path to a pluggable auth module (live mode).
  --auth-state <file>
                   Session saved by \`web-checks auth record\` (or a Playwright
                   storageState file): for logins that cannot be scripted
                   (OAuth/SSO, MFA). Checked before the run: an expired session
                   stops it (exit 3). With --auth too, the module logs in again.
  --auth-cache <file>
                   Save the session after login and reuse it on later runs
                   (12 h, or "auth.cache.ttl" in the config file).
  --refresh-auth   Force re-login, ignoring the auth cache.
  --format <name>  Output format: text (default), agent — Markdown with only
                   errors/warnings and what each check verified, for AI prompts —
                   json — machine-readable, for CI and programmatic use — or
                   poqa — the poqa-findings/v1 format shared by the poqa suite.
  -o, --output <file>
                   Write the report to a file instead of stdout.
  --timeout <ms>   HTTP request timeout in milliseconds (default 15000; beats
                   "timeouts.httpMs" in the config file).
  --lighthouse     Enable Lighthouse (Tier 2). In v1 this lands in v1.x.
  --no-color       Disable colored output (also honored: NO_COLOR, non-TTY).
  -q, --quiet      Print only errors on stderr (the report is still written).
  -v, --verbose    Also print debug messages on stderr.
  -h, --help       Show this help.
  -V, --version    Show the version.

CI gates (exit 2 when crossed, opt-in):
  --fail-below-grade <g>
                   Exit 2 when the overall grade is below g: A|B|C|D|E|F
                   (beats "failBelowGrade" in the config file). Source-only
                   runs have no grade and never fail it.

Exit codes:
  0  run completed   1  usage error
  2  CI gate crossed (--fail-below-grade)
  3  target unreachable, browser unavailable, fatal error
  Same codes as every poqa tool.
`;

/**
 * Exit codes per SPEC §"Exit code", the same as every poqa tool
 * (effective-train docs/poqa-findings.md §Exit codes).
 */
const EXIT = { ok: 0, usage: 1, ciFail: 2, fatal: 3 } as const;

const GRADES: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'auth') return authMain(argv.slice(1));
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        mode: { type: 'string' },
        config: { type: 'string' },
        auth: { type: 'string' },
        'auth-state': { type: 'string' },
        'auth-cache': { type: 'string' },
        pack: { type: 'string' },
        only: { type: 'string' },
        'no-browser': { type: 'boolean', default: false },
        'refresh-auth': { type: 'boolean', default: false },
        format: { type: 'string', default: 'text' },
        output: { type: 'string', short: 'o' },
        'fail-below-grade': { type: 'string' },
        timeout: { type: 'string' },
        lighthouse: { type: 'boolean', default: false },
        'no-color': { type: 'boolean', default: false },
        quiet: { type: 'boolean', short: 'q', default: false },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'V', default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return EXIT.usage;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(USAGE);
    return EXIT.ok;
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return EXIT.ok;
  }
  if (positionals.length === 0) {
    process.stderr.write('error: no target provided\n\n');
    process.stderr.write(USAGE);
    return EXIT.usage;
  }
  if (values.lighthouse) {
    process.stderr.write('Lighthouse integration lands in v1.x\n');
  }

  const format = values.format as string;
  if (format !== 'text' && format !== 'agent' && format !== 'json' && format !== 'poqa') {
    process.stderr.write(`error: unknown format "${format}" (expected: text, agent, json, poqa)\n`);
    return EXIT.usage;
  }

  const gradeFlag = values['fail-below-grade'] as string | undefined;
  if (gradeFlag !== undefined && !GRADES.includes(gradeFlag)) {
    process.stderr.write(
      `error: invalid --fail-below-grade "${gradeFlag}" (expected: A|B|C|D|E|F)\n`,
    );
    return EXIT.usage;
  }

  const verbose = (values.verbose as boolean[] | undefined)?.length ?? 0;
  if (values.quiet && verbose > 0) {
    process.stderr.write('error: --quiet and --verbose cannot be combined\n');
    return EXIT.usage;
  }
  const quiet = Boolean(values.quiet);
  const logLevel = quiet ? 'error' : verbose > 0 ? 'debug' : 'info';

  let httpTimeoutMs: number | undefined;
  if (values.timeout !== undefined) {
    httpTimeoutMs = Number(values.timeout);
    if (!Number.isInteger(httpTimeoutMs) || httpTimeoutMs <= 0) {
      process.stderr.write(
        `error: invalid --timeout "${values.timeout}" (expected a positive integer in ms)\n`,
      );
      return EXIT.usage;
    }
  }

  let packs: Pack[] | undefined;
  if (values.pack !== undefined) {
    const list = splitList(values.pack as string);
    const unknown = list.filter((p) => !isPack(p));
    if (list.length === 0 || unknown.length > 0) {
      process.stderr.write(
        `error: invalid --pack "${values.pack}" (expected a comma-separated list of: ${PACKS.join(', ')})\n`,
      );
      return EXIT.usage;
    }
    packs = list as Pack[];
  }
  let only: string[] | undefined;
  if (values.only !== undefined) {
    only = splitList(values.only as string);
    if (only.length === 0) {
      process.stderr.write('error: --only needs at least one check id\n');
      return EXIT.usage;
    }
    if (packs) {
      process.stderr.write('error: --pack and --only cannot be combined\n');
      return EXIT.usage;
    }
  }

  let modes: ReturnType<typeof parseModeFlag> | undefined;
  try {
    modes = values.mode ? parseModeFlag(values.mode as string) : undefined;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return EXIT.usage;
  }

  try {
    const authModule = values.auth as string | undefined;
    const authState = values['auth-state'] as string | undefined;
    const authCache = values['auth-cache'] as string | undefined;
    const auth = {
      ...(authModule ? { module: authModule } : {}),
      ...(authState ? { storageState: authState } : {}),
      ...(authCache ? { cache: { path: authCache, ttl: DEFAULT_AUTH_CACHE_TTL_MS } } : {}),
    };
    const result = await run({
      targets: positionals,
      modes,
      lighthouse: Boolean(values.lighthouse),
      refreshAuth: Boolean(values['refresh-auth']),
      noBrowser: Boolean(values['no-browser']),
      ...(packs ? { packs } : {}),
      ...(only ? { only } : {}),
      logLevel,
      ...(gradeFlag ? { failBelowGrade: gradeFlag as Grade } : {}),
      ...(httpTimeoutMs !== undefined ? { httpTimeoutMs } : {}),
      ...(values.config ? { configPath: values.config as string } : {}),
      ...(Object.keys(auth).length > 0 ? { auth } : {}),
    });
    const output =
      format === 'agent'
        ? formatAgent(result)
        : format === 'json'
          ? formatJson(result)
          : format === 'poqa'
            ? formatPoqa(result)
            : formatText(result, { noColor: Boolean(values['no-color']) });
    const outFile = values.output as string | undefined;
    if (outFile !== undefined) {
      // Atomic: a reader never sees a half-written report.
      const tmp = `${outFile}.tmp-${process.pid}`;
      await writeFile(tmp, `${output}\n`);
      await rename(tmp, outFile);
      if (!quiet) process.stderr.write(`Wrote ${format} report → ${outFile}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
    if (result.gate && !result.gate.passed) {
      process.stderr.write(
        `CI gate crossed: grade ${result.score.grade} is below ${result.gate.failBelowGrade} (--fail-below-grade)\n`,
      );
      return EXIT.ciFail;
    }
    return EXIT.ok;
  } catch (err) {
    if (
      err instanceof BrowserUnavailableError ||
      err instanceof TargetUnreachableError ||
      err instanceof AuthError
    ) {
      process.stderr.write(`error: ${err.message}\n`);
      return EXIT.fatal;
    }
    if (err instanceof ModeError || err instanceof ConfigError) {
      process.stderr.write(`error: ${err.message}\n`);
      return EXIT.usage;
    }
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    return EXIT.fatal;
  }
}

function splitList(v: string): string[] {
  return v
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});

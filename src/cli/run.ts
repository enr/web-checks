// Orchestration: resolve modes, build an InputSource per target, run the engine
// once per mode, fuse the results, and assemble the RunResult.

import { expandPlaceholders } from '../auth/context.js';
import { authenticate } from '../auth/runner.js';
import type { AuthRuntime } from '../auth/types.js';
import type { BrowserDriver } from '../browser/driver.js';
import { launchDriver } from '../browser/playwright.js';
import { detectPwa } from '../checks/detect.js';
import type { Grade, Mode } from '../core/check.js';
import type { AuthConfig } from '../core/config.js';
import { fuseModes, runMode } from '../core/engine.js';
import { ConsoleLogger, type LogLevel, SecretRegistry } from '../core/logger.js';
import { type ResolvedTarget, resolveModes } from '../core/modes.js';
import { DEFAULT_PACKS, PACKS, type Pack, packOf, selectModules } from '../core/packs.js';
import { ALL_CHECKS } from '../core/registry.js';
import { loadConfigFile, resolveConfig } from '../loaders/config.js';
import { FsSource, HttpSource, type InputSource } from '../loaders/input.js';
import { validateConfig } from '../loaders/validate.js';
import { type PackState, type RunResult, buildRunResult } from '../report/result.js';

/** Thrown on invalid config (unknown keys, bad types, reserved keys) -> exit 1. */
export class ConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('; '));
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when the selected checks need a browser (live target, Tier 1) and
 * Playwright cannot start one -> exit 3. A run that silently skipped every
 * browser check would look green without having verified anything.
 */
export class BrowserUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(
      `the selected checks need a browser for the live target, but ${reason}. Install it, or pass --no-browser to run only the static (Tier 0) checks.`,
    );
    this.name = 'BrowserUnavailableError';
  }
}

/**
 * Thrown when a live target does not answer at all (DNS failure, refused
 * connection, timeout) -> exit 3: grading pages that could not be loaded
 * would report an F for a problem that is not in the app.
 */
export class TargetUnreachableError extends Error {
  constructor(
    public readonly target: string,
    public readonly reason: string,
  ) {
    super(`target ${target} is unreachable (${reason})`);
    this.name = 'TargetUnreachableError';
  }
}

export interface RunOptions {
  targets: string[];
  modes?: Mode[];
  lighthouse?: boolean;
  ignore?: string[];
  /** --pack: replaces the default packs and PWA detection. */
  packs?: Pack[];
  /** --only: check id patterns (`RUN-*`), instead of packs. */
  only?: string[];
  logLevel?: LogLevel;
  /** CI gate threshold (beats the config file): RunResult.gate reports whether the grade meets it. */
  failBelowGrade?: Grade;
  /** HTTP request timeout in ms (--timeout; beats the config file). */
  httpTimeoutMs?: number;
  /** --no-browser: do not launch a browser; Tier 1 checks are skipped (no-browser). */
  noBrowser?: boolean;
  /** Pluggable authentication for live targets. */
  auth?: AuthConfig;
  /** Force re-login, ignoring the auth cache (--refresh-auth). */
  refreshAuth?: boolean;
  /** Explicit config file path; otherwise auto-discovered in cwd. */
  configPath?: string;
  /** Skip config-file discovery (tests). */
  noConfigFile?: boolean;
}

function buildInputSource(
  t: ResolvedTarget,
  httpMs: number,
  headers?: Record<string, string>,
): InputSource {
  if (t.mode === 'live')
    return new HttpSource(t.target, { httpMs, ...(headers ? { headers } : {}) });
  return new FsSource(t.target, t.mode);
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const resolvedTargets = await resolveModes(opts.targets, opts.modes);

  // Load + validate an optional config file (unknown keys / reserved keys are
  // usage errors — SPEC §Backlog D3).
  let user: ReturnType<typeof validateConfig>['config'];
  if (!opts.noConfigFile) {
    const loaded = await loadConfigFile(process.cwd(), opts.configPath);
    if (loaded) {
      const { config: validated, errors } = validateConfig(loaded.raw);
      if (errors.length > 0) throw new ConfigError(errors);
      user = validated;
    } else if (opts.configPath) {
      throw new ConfigError([`config file not found: ${opts.configPath}`]);
    }
  }

  const config = resolveConfig({
    targets: resolvedTargets.map((t) => ({ mode: t.mode, target: t.target })),
    lighthouse: opts.lighthouse,
    ignore: opts.ignore,
    packs: opts.packs,
    only: opts.only,
    failBelowGrade: opts.failBelowGrade,
    httpTimeoutMs: opts.httpTimeoutMs,
    user,
  });

  const secrets = new SecretRegistry();
  const log = new ConsoleLogger(secrets, opts.logLevel ?? 'info');

  // One InputSource per target, reused by detection and by the run (the
  // manifest loader caches per InputSource).
  // HTTP credentials (a Basic-auth proxy in front of the app) also gate the
  // static (Tier 0) requests, not only the browser.
  const authConfig = mergeAuthConfig(config.auth, opts.auth);
  const basic = authConfig?.httpCredentials
    ? basicAuthHeader(authConfig.httpCredentials, secrets)
    : undefined;
  const inputs = resolvedTargets.map((t) => ({
    target: t,
    input: buildInputSource(t, config.timeouts.httpMs, basic),
  }));

  for (const { target, input } of inputs) {
    if (input instanceof HttpSource) {
      const reason = await input.unreachableReason();
      if (reason !== null) throw new TargetUnreachableError(target.target, reason);
    }
  }

  const packStates = await decidePacks(config, inputs);
  const selection = selectModules(ALL_CHECKS, {
    packs: new Set(packStates.filter((s) => s.active).map((s) => s.pack)),
    ...(config.only ? { only: config.only } : {}),
  });
  if (config.only && selection.selected.size === 0) {
    throw new ConfigError([`--only ${config.only.join(',')} matches no check`]);
  }
  if (config.only) {
    // Report the packs that --only actually touched.
    const touched = new Set(
      selection.modules
        .filter((m) => selection.selected.has(m.check.id))
        .map((m) => packOf(m.check)),
    );
    for (const s of packStates) {
      s.active = touched.has(s.pack);
      s.reason = 'only';
      s.evidence = undefined;
    }
  }

  // A browser is needed only for live targets with Tier 1 checks selected.
  const liveTarget = resolvedTargets.find((t) => t.mode === 'live');
  const needsBrowser =
    !opts.noBrowser && liveTarget !== undefined && selection.modules.some((m) => m.check.tier > 0);
  let browser: BrowserDriver | null = null;
  if (needsBrowser) {
    const launched = await launchDriver({ headless: true });
    if (!launched.driver) throw new BrowserUnavailableError(launched.reason);
    browser = launched.driver;
  }

  try {
    // Authenticate once, before the (deterministic) measurements, reusing the
    // session across every route and breakpoint (SPEC §Autenticazione).
    let auth: AuthRuntime | undefined;
    if (authConfig && liveTarget) {
      auth = await authenticate(authConfig, {
        driver: browser,
        baseUrl: liveTarget.target,
        secrets,
        log,
        refresh: opts.refreshAuth,
      });
    }

    const perMode = [];
    for (const { target: t, input } of inputs) {
      const findings = await runMode(selection.modules, {
        input,
        config,
        log,
        ...(t.mode === 'live' && browser ? { browser } : {}),
        ...(t.mode === 'live' && auth ? { auth } : {}),
      });
      // Checks that ran only as dependencies of a selected check stay out of
      // the report: their result already shows in the dependent check.
      perMode.push({
        mode: t.mode,
        findings: findings.filter((f) => selection.selected.has(f.check.id)),
      });
    }

    const fused = fuseModes(perMode);
    return buildRunResult(
      fused,
      config,
      resolvedTargets.map((t) => ({ mode: t.mode, target: t.target, reason: t.reason })),
      packStates,
    );
  } finally {
    await browser?.close();
  }
}

function basicAuthHeader(
  creds: { username: string; password: string },
  secrets: SecretRegistry,
): Record<string, string> {
  const user = expandPlaceholders(creds.username, secrets);
  const pass = expandPlaceholders(creds.password, secrets);
  secrets.register(pass);
  const token = Buffer.from(`${user}:${pass}`).toString('base64');
  secrets.register(token);
  return { Authorization: `Basic ${token}` };
}

/**
 * The auth settings of the config file with the CLI flags on top. A cache path
 * from --auth-cache keeps the TTL of the config file, if it sets one.
 */
export function mergeAuthConfig(
  fromFile: AuthConfig | undefined,
  fromCli: AuthConfig | undefined,
): AuthConfig | undefined {
  if (!fromFile && !fromCli) return undefined;
  const merged: AuthConfig = { ...fromFile, ...fromCli };
  if (fromCli?.cache && fromFile?.cache) {
    merged.cache = { path: fromCli.cache.path, ttl: fromFile.cache.ttl };
  }
  const empty =
    !merged.module && !merged.storageState && !merged.headers && !merged.httpCredentials;
  return empty ? undefined : merged;
}

/**
 * Which packs run (SPEC §"Perimetro e pacchetti"): the explicit list from
 * --pack/`packs`, or the defaults plus `pwa` when any target looks like a PWA.
 */
async function decidePacks(
  config: ReturnType<typeof resolveConfig>,
  inputs: { input: InputSource }[],
): Promise<PackState[]> {
  if (config.packs) {
    const chosen = new Set(config.packs);
    return PACKS.map((pack) => ({
      pack,
      active: chosen.has(pack),
      reason: chosen.has(pack) ? 'selected' : 'not-selected',
    }));
  }
  const defaults = new Set<Pack>(DEFAULT_PACKS);
  const states: PackState[] = PACKS.map((pack) => ({
    pack,
    active: defaults.has(pack),
    reason: 'default',
  }));
  const pwa = states.find((s) => s.pack === 'pwa') as PackState;
  const evidence: string[] = [];
  for (const { input } of inputs) {
    const d = await detectPwa(input);
    if (d.detected) {
      pwa.active = true;
      pwa.reason = 'detected';
      pwa.evidence = d.evidence;
      return states;
    }
    evidence.push(d.evidence);
  }
  pwa.active = false;
  pwa.reason = 'not-detected';
  pwa.evidence = [...new Set(evidence)].join('; ');
  return states;
}

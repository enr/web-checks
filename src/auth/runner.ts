// Auth runner: build the authenticated session once (before checks) from, in
// order, the cache, a recorded session file, or the auth module; apply the
// login-wall guard; return an AuthRuntime reused across all routes/breakpoints
// (SPEC §"Ciclo di vita").

import type { BrowserDriver } from '../browser/driver.js';
import type { AuthConfig } from '../core/config.js';
import type { Logger, SecretRegistry } from '../core/logger.js';
import { readAuthCache, readSessionFile, writeAuthCache } from './cache.js';
import { createAuthContext, expandPlaceholders } from './context.js';
import { AuthError, assertReady, missingEnvVars, runDsl } from './dsl.js';
import { detectForm, loadAuthModule } from './loader.js';
import type { AuthRuntime, AuthSession, Cookie, HttpCredentials, StorageState } from './types.js';

export interface AuthDeps {
  driver: BrowserDriver | null;
  baseUrl: string;
  secrets: SecretRegistry;
  log: Logger;
  refresh?: boolean;
}

/** Parts of the session set in the config rather than produced by a login. */
interface Extras {
  headers?: Record<string, string>;
  httpCredentials?: HttpCredentials;
}

export async function authenticate(authConfig: AuthConfig, deps: AuthDeps): Promise<AuthRuntime> {
  const { driver, baseUrl, secrets, log } = deps;
  const refresh = deps.refresh || authConfig.refresh;
  const extras = resolveExtras(authConfig, secrets);
  const withState = (storageState: StorageState): AuthRuntime => ({
    session: merge({ storageState }, extras),
    storageState,
  });

  // 1. Cache hit → skip login, as long as the session still opens the app.
  if (authConfig.cache && !refresh) {
    const cached = await readAuthCache(authConfig.cache.path, authConfig.cache.ttl);
    if (cached) {
      const wall = await verify(cached);
      if (!wall) {
        log.info('Reusing cached authenticated session.');
        return withState(cached);
      }
      log.info(`Cached session no longer valid (${wall}); logging in again.`);
    }
  }

  // 2. Recorded session (web-checks auth record).
  if (authConfig.storageState) {
    const path = authConfig.storageState;
    let recorded: StorageState;
    try {
      recorded = (await readSessionFile(path)).storageState;
    } catch (err) {
      throw new AuthError(`auth: cannot read session file ${path}: ${(err as Error).message}`);
    }
    const wall = await verify(recorded);
    if (!wall) {
      log.info(`Using the recorded session in ${path}.`);
      return withState(recorded);
    }
    const again = `record it again: web-checks auth record ${baseUrl} -o ${path}`;
    if (!authConfig.module) {
      throw new AuthError(
        `auth failed / expired: the recorded session in ${path} ${wall}; ${again}`,
      );
    }
    log.warn(`The recorded session in ${path} ${wall}; trying the auth module (or ${again}).`);
  }

  // 3. No module → config-only session (headers / HTTP credentials).
  if (!authConfig.module) {
    return { session: merge({}, extras) };
  }

  const mod = await loadAuthModule(authConfig.module);
  const form = detectForm(mod);
  const ctx = createAuthContext(baseUrl, secrets, log);

  // 4. Session form: no browser needed.
  if (form.kind === 'session') {
    return { session: merge(normalizeSession(form.value, baseUrl), extras) };
  }

  if (!driver) {
    log.warn('Auth module needs a browser but none is available; skipping auth.');
    return { session: merge({}, extras) };
  }

  if (form.kind === 'dsl') {
    const missing = missingEnvVars(form.value);
    if (missing.length > 0) {
      throw new AuthError(`auth: missing environment variable(s): ${missing.join(', ')}`);
    }
  }

  // 5. Log in (DSL or function).
  const page = await driver.newAuthPage(
    baseUrl,
    extras.httpCredentials ? { httpCredentials: extras.httpCredentials } : undefined,
  );
  try {
    let storageState: StorageState | undefined;
    if (form.kind === 'dsl') {
      await runDsl(page, form.value, ctx, secrets);
      await assertReady(page, form.value.ready ?? authConfig.ready);
      storageState = await page.storageState();
    } else {
      const result = await form.value(page.raw(), ctx);
      if (result && typeof result === 'object' && 'storageState' in result && result.storageState) {
        storageState = result.storageState;
      } else if (
        result &&
        typeof result === 'object' &&
        ('cookies' in result || 'headers' in result || 'sessionStorage' in result)
      ) {
        return { session: merge(normalizeSession(result as AuthSession, baseUrl), extras) };
      } else {
        if (authConfig.ready) await assertReady(page, authConfig.ready);
        storageState = await page.storageState();
      }
    }

    if (authConfig.cache && storageState) {
      await writeAuthCache(authConfig.cache.path, storageState);
    }
    return withState(storageState);
  } finally {
    await page.close();
  }

  /**
   * Open the target with a stored session and apply the login-wall guard.
   * Returns why the app still shows a login wall, or null when it opens (or
   * when there is no browser to tell).
   */
  async function verify(state: StorageState): Promise<string | null> {
    if (!driver) return null;
    const page = await driver.newAuthPage(baseUrl, merge({ storageState: state }, extras));
    try {
      await page.goto(
        authConfig.ready?.url && !/[*?]/.test(authConfig.ready.url)
          ? authConfig.ready.url
          : baseUrl,
      );
      await assertReady(page, authConfig.ready);
      return null;
    } catch (err) {
      if (err instanceof AuthError) return describeWall(err.message);
      return `could not be verified: ${(err as Error).message.split('\n')[0]}`;
    } finally {
      await page.close();
    }
  }
}

function describeWall(message: string): string {
  return `does not open the app (${message.replace(/^auth (failed \/ expired|ready check failed): /, '')})`;
}

/** Expand placeholders in the config's headers and HTTP credentials. */
function resolveExtras(authConfig: AuthConfig, secrets: SecretRegistry): Extras {
  const extras: Extras = {};
  if (authConfig.headers) {
    extras.headers = Object.fromEntries(
      Object.entries(authConfig.headers).map(([k, v]) => [k, expandPlaceholders(v, secrets)]),
    );
  }
  if (authConfig.httpCredentials) {
    extras.httpCredentials = {
      username: expandPlaceholders(authConfig.httpCredentials.username, secrets),
      password: expandPlaceholders(authConfig.httpCredentials.password, secrets),
    };
    secrets.register(extras.httpCredentials.password);
  }
  return extras;
}

/** Cookies without a domain belong to the target (Playwright needs one). */
function normalizeSession(session: AuthSession, baseUrl: string): AuthSession {
  if (!session.cookies) return session;
  const { hostname, protocol } = new URL(baseUrl);
  const cookies: Cookie[] = session.cookies.map((c) => ({
    ...c,
    domain: c.domain ?? hostname,
    path: c.path ?? '/',
    secure: c.secure ?? protocol === 'https:',
  }));
  return { ...session, cookies };
}

function merge(session: AuthSession, extras: Extras): AuthSession {
  const out: AuthSession = { ...session };
  if (extras.headers) out.headers = { ...extras.headers, ...session.headers };
  if (extras.httpCredentials && !session.httpCredentials) {
    out.httpCredentials = extras.httpCredentials;
  }
  return out;
}

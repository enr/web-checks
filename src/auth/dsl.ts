// DSL interpreter (SPEC §"DSL — supported steps"). Runs a safe, framework-
// agnostic subset of steps on an AuthPage. {{env.*}}/{{secret.*}} are expanded;
// secrets are registered for redaction.

import type { AuthPage } from '../browser/driver.js';
import type { SecretRegistry } from '../core/logger.js';
import { PLACEHOLDER, expandPlaceholders } from './context.js';
import type { AuthContext, AuthDSL, ReadyCondition } from './types.js';

export class AuthError extends Error {}

/**
 * Env vars referenced via {{env.X}}/{{secret.X}} in the DSL steps that are not
 * set in the environment. Checked before opening the auth page so a missing
 * credential fails fast instead of submitting empty values and timing out on
 * the ready check.
 */
export function missingEnvVars(dsl: AuthDSL): string[] {
  const values: string[] = [];
  for (const step of dsl.steps) {
    if ('fill' in step) values.push(step.value);
    else if ('setCookie' in step) values.push(step.setCookie.value);
    else if ('setLocalStorage' in step) values.push(step.setLocalStorage.value);
    else if ('setSessionStorage' in step) values.push(step.setSessionStorage.value);
  }
  const missing = new Set<string>();
  for (const value of values) {
    for (const m of value.matchAll(PLACEHOLDER)) {
      const name = m[2] as string;
      if (process.env[name] === undefined) missing.add(name);
    }
  }
  return [...missing];
}

export async function runDsl(
  page: AuthPage,
  dsl: AuthDSL,
  ctx: AuthContext,
  secrets: SecretRegistry,
): Promise<void> {
  const exp = (v: string): string => expandPlaceholders(v, secrets);
  for (const step of dsl.steps) {
    if ('goto' in step) {
      await page.goto(ctx.resolve(step.goto));
    } else if ('fill' in step) {
      await page.fill(step.fill, exp(step.value));
    } else if ('click' in step) {
      await page.click(step.click);
    } else if ('press' in step) {
      await page.press(step.press, step.key);
    } else if ('waitFor' in step) {
      const w = step.waitFor;
      if ('url' in w) await page.waitForUrl(w.url);
      else await page.waitForSelector(w.selector);
    } else if ('setCookie' in step) {
      await page.setCookie({ ...step.setCookie, value: exp(step.setCookie.value) });
    } else if ('setLocalStorage' in step) {
      await page.setLocalStorage(step.setLocalStorage.key, exp(step.setLocalStorage.value));
    } else if ('setSessionStorage' in step) {
      await page.setSessionStorage(step.setSessionStorage.key, exp(step.setSessionStorage.value));
    }
  }
}

/**
 * The last path segment of a login page: /login, /signin, /sign-in, /log-in,
 * /logon. Matched as a whole segment, so app routes under /auth/... or
 * /oauth/... after a successful login are not taken for a login page.
 */
const LOGIN_PATH = /\/(?:log-?in|sign-?in|log-?on)\/?$/i;

/** How long the heuristic guard waits for the login wall to go away. */
const HEURISTIC_GRACE_MS = 5000;

/** A visible password field: the page still asks for credentials. */
const PASSWORD_FIELD = 'input[type="password"]';

/**
 * Why the page looks like a login wall, or null. Heuristic used when no
 * `ready` condition is given: a visible password field, or a URL whose path
 * ends in a login segment.
 */
export async function loginWallReason(page: AuthPage): Promise<string | null> {
  const url = page.currentUrl();
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // keep the raw string
  }
  if (LOGIN_PATH.test(path)) return `still at a login page (${url})`;
  if (await page.isVisible(PASSWORD_FIELD).catch(() => false)) {
    return `a password field is still visible (${url})`;
  }
  return null;
}

/**
 * Login-wall guard: verify the ready condition post-login. Throws AuthError on
 * failure (fail-fast) so the run does not produce misleading results.
 */
export async function assertReady(
  page: AuthPage,
  ready: ReadyCondition | undefined,
): Promise<void> {
  if (!ready || (!ready.url && !ready.selector)) {
    // The submit may still be in flight: give the redirect a bounded chance.
    const deadline = Date.now() + (ready?.timeoutMs ?? HEURISTIC_GRACE_MS);
    let reason = await loginWallReason(page);
    while (reason && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      reason = await loginWallReason(page);
    }
    if (reason) throw new AuthError(`auth failed / expired: ${reason}`);
    return;
  }
  const timeout = ready.timeoutMs ?? 10000;
  if (ready.url) {
    try {
      await page.waitForUrl(ready.url, timeout);
    } catch {
      throw new AuthError(`auth ready check failed: URL did not match ${ready.url}`);
    }
  }
  if (ready.selector) {
    try {
      await page.waitForSelector(ready.selector, timeout);
    } catch {
      throw new AuthError(`auth ready check failed: selector not visible ${ready.selector}`);
    }
  }
}

// AuthContext implementation (SPEC §Autenticazione). Provides env/secret/totp/
// resolve/log to the user auth module; secrets are registered for redaction so
// they never reach report/log (§A.6).

import type { Logger, SecretRegistry } from '../core/logger.js';
import { totp } from './totp.js';
import type { AuthContext } from './types.js';

export function createAuthContext(
  baseUrl: string,
  secrets: SecretRegistry,
  log: Logger,
): AuthContext {
  const read = (name: string): string => {
    const value = process.env[name];
    if (value === undefined) log.warn(`auth: environment variable ${name} is not set`);
    return value ?? '';
  };
  return {
    baseUrl,
    env: read,
    secret(name: string): string {
      const value = read(name);
      secrets.register(value);
      return value;
    },
    totp(name: string): string {
      const seed = read(name);
      secrets.register(seed);
      const code = totp(seed);
      secrets.register(code);
      return code;
    },
    resolve(path: string): string {
      if (/^https?:\/\//.test(path)) return path;
      return baseUrl.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
    },
    log,
  };
}

/** {{env.X}} / {{secret.X}} / {{totp.X}}: the placeholders of the DSL and config. */
export const PLACEHOLDER = /\{\{(env|secret|totp)\.([A-Za-z0-9_]+)\}\}/g;

/**
 * Expand {{env.X}} / {{secret.X}} / {{totp.X}} placeholders in a value. Secret
 * values (and TOTP seeds and codes) are registered for redaction so they cannot
 * leak into evidence/logs. {{totp.X}} is the current code for the base32 seed
 * in X, computed at expansion time.
 */
export function expandPlaceholders(value: string, secrets: SecretRegistry): string {
  return value.replace(PLACEHOLDER, (_m, kind: string, name: string) => {
    const resolved = process.env[name] ?? '';
    if (kind === 'env') return resolved;
    secrets.register(resolved);
    if (kind === 'secret') return resolved;
    const code = totp(resolved);
    secrets.register(code);
    return code;
  });
}

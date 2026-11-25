// Detect the form of the user auth module's default export (SPEC §Authentication):
// AuthFn (function) | AuthDSL ({ steps }) | AuthSession (cookies/headers/state).

import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AuthDSL, AuthFn, AuthModule, AuthSession } from './types.js';

export type AuthForm =
  | { kind: 'fn'; value: AuthFn }
  | { kind: 'dsl'; value: AuthDSL }
  | { kind: 'session'; value: AuthSession };

export function detectForm(mod: AuthModule): AuthForm {
  if (typeof mod === 'function') return { kind: 'fn', value: mod };
  if (mod && typeof mod === 'object' && Array.isArray((mod as AuthDSL).steps)) {
    return { kind: 'dsl', value: mod as AuthDSL };
  }
  return { kind: 'session', value: (mod ?? {}) as AuthSession };
}

/** Dynamically import the auth module and return its default export. */
export async function loadAuthModule(modulePath: string): Promise<AuthModule> {
  const abs = isAbsolute(modulePath) ? modulePath : resolve(process.cwd(), modulePath);
  const imported = (await import(pathToFileURL(abs).href)) as {
    default?: AuthModule;
  } & AuthModule;
  const mod = imported.default ?? imported;
  return mod as AuthModule;
}

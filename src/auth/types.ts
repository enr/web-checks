// Pluggable authentication contract (SPEC §Autenticazione).
// The user supplies a single JS file whose default export is one of three forms,
// or a recorded session (`web-checks auth record`) loaded from a file.

import type { Logger } from '../core/logger.js';

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  /** Unix time in seconds; -1 or absent = session cookie. */
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** sessionStorage of one origin. Not part of Playwright's storageState. */
export interface SessionStorageEntry {
  origin: string;
  entries: { name: string; value: string }[];
}

/**
 * Playwright-compatible storage state (cookies + origins, with IndexedDB when
 * captured) plus sessionStorage, which Playwright does not persist and which
 * OAuth clients such as MSAL use by default.
 */
export interface StorageState {
  cookies: Cookie[];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
    /** Opaque, as serialized by Playwright (`storageState({ indexedDB: true })`). */
    indexedDB?: unknown[];
  }[];
  sessionStorage?: SessionStorageEntry[];
}

/** HTTP authentication (Basic/Digest/NTLM) answered by the browser. */
export interface HttpCredentials {
  username: string;
  password: string;
}

/** Token/header flow without a browser. */
export interface AuthSession {
  cookies?: Cookie[];
  headers?: Record<string, string>;
  storageState?: StorageState;
  /** Seeded into each page before the app's scripts run. */
  sessionStorage?: SessionStorageEntry[];
  httpCredentials?: HttpCredentials;
}

export interface AuthContext {
  baseUrl: string;
  env(name: string): string;
  /** Secrets: never printed to report/log. */
  secret(name: string): string;
  /** Current TOTP code (RFC 6238) for the base32 secret in env var `name`; redacted. */
  totp(name: string): string;
  resolve(path: string): string;
  log: Logger;
}

// SPEC §Autenticazione defines this union with `void` (a fn that returns nothing).
// biome-ignore lint/suspicious/noConfusingVoidType: matches the SPEC contract
export type AuthResult = void | { storageState?: StorageState } | AuthSession;

/** Imperative escape hatch: full Playwright control. */
export type AuthFn = (page: unknown, ctx: AuthContext) => Promise<AuthResult>;

/** At least one of url/selector; if both present, both must hold. */
export interface ReadyCondition {
  url?: string;
  selector?: string;
  timeoutMs?: number;
}

export type AuthStep =
  | { goto: string }
  | { fill: string; value: string }
  | { click: string }
  | { press: string; key: string }
  | { waitFor: { url: string } | { selector: string } }
  | { setCookie: Cookie }
  | { setLocalStorage: { key: string; value: string } }
  | { setSessionStorage: { key: string; value: string } };

export interface AuthDSL {
  steps: AuthStep[];
  ready?: ReadyCondition;
}

/** The default export of the user auth module. */
export type AuthModule = AuthFn | AuthDSL | AuthSession;

/** Authenticated session made available to checks via CheckContext. */
export interface AuthRuntime {
  session: AuthSession;
  storageState?: StorageState;
}

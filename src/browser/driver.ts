// BrowserDriver — the runtime boundary (IMPLEMENTATION_PLAN §A.3).
// The single place that touches Playwright. Abstracted so the same code runs
// in-process (Node) or via a worker (Bun). No check imports `playwright`;
// they use only this interface. Implementations land in Phase 2.

import type { AuthSession, Cookie, StorageState } from '../auth/types.js';

export type WaitUntil = 'networkidle' | 'load';

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface DriverPage {
  goto(url: string, opts?: { waitUntil?: WaitUntil }): Promise<{ status: number }>;
  setViewport(v: Viewport): Promise<void>;
  /** Only serializable functions + JSON args (also valid for a future Bun worker). */
  evaluate<T>(fn: (arg?: unknown) => T, arg?: unknown): Promise<T>;
  on(event: 'console' | 'pageerror' | 'response', cb: (e: unknown) => void): void;
  setOffline(offline: boolean): Promise<void>;
  /** Disable animations/transitions before measuring (SPEC §Responsiveness). */
  addInitScript(js: string): Promise<void>;
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}

/** A page with the operations needed to drive authentication (SPEC §Auth DSL). */
export interface AuthPage {
  goto(url: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  waitForUrl(glob: string, timeoutMs?: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
  setCookie(cookie: Cookie): Promise<void>;
  setLocalStorage(key: string, value: string): Promise<void>;
  /** Writes sessionStorage on the current page's origin (goes to baseUrl first if blank). */
  setSessionStorage(key: string, value: string): Promise<void>;
  isVisible(selector: string): Promise<boolean>;
  currentUrl(): string;
  /** Underlying Playwright Page for the imperative AuthFn escape hatch. */
  raw(): unknown;
  /** Cookies, localStorage, IndexedDB and the sessionStorage of the open pages. */
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}

export interface BrowserDriver {
  launch(opts?: { headless?: boolean }): Promise<void>;
  newPage(session?: AuthSession): Promise<DriverPage>;
  /**
   * A page for running the auth flow (DSL / imperative), or for verifying a
   * session (cache, recorded state) when one is given.
   */
  newAuthPage(baseUrl?: string, session?: AuthSession): Promise<AuthPage>;
  close(): Promise<void>;
}

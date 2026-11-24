// Resolved configuration schema (IMPLEMENTATION_PLAN §B.3).
// The loader always produces a complete object with defaults applied — no
// scattered `undefined` inside checks.

import type { Category, Grade, Mode } from './check.js';
import type { Pack } from './packs.js';

export interface Breakpoint {
  name: string;
  width: number;
  height: number;
  class: 'mobile' | 'tablet' | 'desktop';
}

/** The six fixed breakpoints (SPEC §"Responsiveness — punto di partenza"). */
export const DEFAULT_BREAKPOINTS: readonly Breakpoint[] = [
  { name: 'mobile-s', width: 320, height: 568, class: 'mobile' },
  { name: 'mobile-m', width: 360, height: 740, class: 'mobile' },
  { name: 'tablet', width: 768, height: 1024, class: 'tablet' },
  { name: 'tablet-l', width: 1024, height: 768, class: 'tablet' },
  { name: 'desktop', width: 1280, height: 800, class: 'desktop' },
  { name: 'desktop-l', width: 1920, height: 1080, class: 'desktop' },
] as const;

/** Default category weights (SPEC §"Pesi per categoria"), sum = 100. */
export const DEFAULT_WEIGHTS: Readonly<Partial<Record<Category, number>>> = {
  Manifest: 20,
  ServiceWorker: 18,
  Responsiveness: 14,
  Installability: 13,
  Icons: 10,
  Html: 8,
  Offline: 8,
  RuntimeHealth: 6,
  UX: 3,
};

export interface LayoutConfig {
  overflowTolerancePx: number;
  overlapTolerancePx: number;
  minTouchTargetPx: number;
  minFontSizePx: number;
  minReadableColWidthPx: number;
  ignoreSelectors: string[];
}

export interface RuntimeConfig {
  /** Origins excluded from RUN-*. Default: all origins other than the target. */
  ignoreOrigins: string[];
  ignoreUrls: string[];
  failOnStatus: number[];
  advisoryStatus: number[];
}

export interface AuthConfig {
  /** Pluggable auth module (DSL / function / session). */
  module?: string;
  /** Static headers; values support {{env.X}} / {{secret.X}}. */
  headers?: Record<string, string>;
  /** storageState cache: path, TTL in ms. */
  cache?: { path: string; ttl: number };
  refresh?: boolean;
  /** Session file recorded with `web-checks auth record` (or a Playwright storageState). */
  storageState?: string;
  /** Login-wall guard for the recorded/cached session and the auth function (a DSL's own `ready` wins). */
  ready?: { url?: string; selector?: string; timeoutMs?: number };
  /** HTTP Basic/Digest/NTLM credentials; values support {{env.X}} / {{secret.X}}. */
  httpCredentials?: { username: string; password: string };
}

/** TTL of the auth cache when only its path is given (--auth-cache): 12 hours. */
export const DEFAULT_AUTH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export interface ResolvedConfig {
  /** ≥1 targets, all with distinct modes. */
  targets: { mode: Mode; target: string }[];
  breakpoints: Breakpoint[];
  layout: LayoutConfig;
  runtime: RuntimeConfig;
  perf: { initialBudgetKb: number };
  timeouts: { httpMs: number; navigationMs: number };
  weights: Partial<Record<Category, number>>;
  ignore: string[];
  /** Packs chosen explicitly (--pack or `packs`); undefined = defaults + PWA detection. */
  packs?: Pack[];
  /** --only patterns: select checks by id instead of by pack. */
  only?: string[];
  routes: string[];
  auth?: AuthConfig;
  /** v1.x — in v1 the flag prints "lands in v1.x" and skips LH-*. */
  lighthouse: boolean;
  /**
   * CI gate (--fail-below-grade, or `failBelowGrade` in the config file):
   * the run fails (exit 2) when the grade is below it. Unset = no gate.
   */
  failBelowGrade?: Grade;
  baseUrl?: string;
  startUrl?: string;
  scope?: string;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  overflowTolerancePx: 1,
  overlapTolerancePx: 1,
  minTouchTargetPx: 44,
  minFontSizePx: 12,
  minReadableColWidthPx: 240,
  ignoreSelectors: [],
};

export const DEFAULT_RUNTIME: RuntimeConfig = {
  ignoreOrigins: [],
  ignoreUrls: [],
  failOnStatus: [404],
  advisoryStatus: [500, 502, 503, 504],
};

export const DEFAULT_TIMEOUTS = { httpMs: 15000, navigationMs: 30000 };

// Config resolution. Produces a complete ResolvedConfig with defaults applied
// (IMPLEMENTATION_PLAN §B.3). Config-file loading via dynamic import() + the
// hand-written validateConfig live here.

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Category, Grade, Mode } from '../core/check.js';
import {
  type Breakpoint,
  DEFAULT_BREAKPOINTS,
  DEFAULT_LAYOUT,
  DEFAULT_RUNTIME,
  DEFAULT_TIMEOUTS,
  type ResolvedConfig,
} from '../core/config.js';
import type { Pack } from '../core/packs.js';
import type { UserConfig } from './validate.js';

export interface ConfigInput {
  targets: { mode: Mode; target: string }[];
  lighthouse?: boolean;
  ignore?: string[];
  /** --pack: replaces the default packs (beats `packs` in the config file). */
  packs?: Pack[];
  /** --only: check id patterns. */
  only?: string[];
  routes?: string[];
  baseUrl?: string;
  /** HTTP request timeout in ms (--timeout; beats "timeouts" in the config file). */
  httpTimeoutMs?: number;
  /** CI gate threshold (--fail-below-grade beats `failBelowGrade` in the config file). */
  failBelowGrade?: Grade;
  /** Validated user config from a config file (overrides defaults). */
  user?: UserConfig;
}

function merge<T extends object>(base: T, over: Partial<T> | undefined): T {
  return over ? { ...base, ...over } : base;
}

export function resolveConfig(input: ConfigInput): ResolvedConfig {
  const u = input.user ?? {};
  const layout = merge(
    { ...DEFAULT_LAYOUT, ignoreSelectors: [...DEFAULT_LAYOUT.ignoreSelectors] },
    u.layout as object | undefined,
  );
  const runtime = merge(
    {
      ...DEFAULT_RUNTIME,
      ignoreOrigins: [...DEFAULT_RUNTIME.ignoreOrigins],
      ignoreUrls: [...DEFAULT_RUNTIME.ignoreUrls],
      failOnStatus: [...DEFAULT_RUNTIME.failOnStatus],
      advisoryStatus: [...DEFAULT_RUNTIME.advisoryStatus],
    },
    u.runtime as object | undefined,
  );

  return {
    targets: input.targets,
    breakpoints: (u.breakpoints as Breakpoint[] | undefined) ?? [...DEFAULT_BREAKPOINTS],
    layout,
    runtime,
    perf: merge({ initialBudgetKb: 300 }, u.perf as object | undefined),
    timeouts: {
      ...merge({ ...DEFAULT_TIMEOUTS }, u.timeouts as object | undefined),
      ...(input.httpTimeoutMs !== undefined ? { httpMs: input.httpTimeoutMs } : {}),
    },
    weights: (u.weights as Partial<Record<Category, number>> | undefined) ?? {},
    ignore: input.ignore ?? (u.ignore as string[] | undefined) ?? [],
    packs: input.packs ?? (u.packs as Pack[] | undefined),
    only: input.only,
    routes: input.routes ?? (u.routes as string[] | undefined) ?? ['/'],
    lighthouse: input.lighthouse ?? (u.lighthouse as boolean | undefined) ?? false,
    baseUrl: input.baseUrl ?? (u.baseUrl as string | undefined),
    startUrl: u.startUrl as string | undefined,
    scope: u.scope as string | undefined,
    failBelowGrade: input.failBelowGrade ?? (u.failBelowGrade as Grade | undefined),
    auth: u.auth as ResolvedConfig['auth'],
  };
}

const CONFIG_NAMES = [
  'web-checks.config.json',
  'web-checks.config.js',
  'web-checks.config.mjs',
  'web-checks.config.cjs',
];

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Find and load a config file from `dir`. JSON is parsed; JS is dynamically
 * imported (default export). Returns null if none is found. `.ts` config
 * requires a loader and is not supported in v1 (documented).
 */
export async function loadConfigFile(
  dir = process.cwd(),
  explicitPath?: string,
): Promise<{ raw: unknown; path: string } | null> {
  const candidates = explicitPath
    ? [isAbsolute(explicitPath) ? explicitPath : resolvePath(dir, explicitPath)]
    : CONFIG_NAMES.map((name) => join(dir, name));

  for (const path of candidates) {
    if (!(await fileExists(path))) continue;
    if (path.endsWith('.json')) {
      const raw = JSON.parse(await readFile(path, 'utf8'));
      return { raw, path };
    }
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
    return { raw: mod.default ?? mod, path };
  }
  return null;
}

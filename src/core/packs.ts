// Check packs (SPEC §"Perimetro e pacchetti"). A pack groups checks by what
// they verify; check ids and categories are unchanged. Membership is derived
// from the check id/category here, in one place, rather than declared in every
// check module, so the mapping can be read (and tested) as a whole.

import type { Check } from './check.js';
import type { CheckModule } from './module.js';

export type Pack = 'runtime' | 'responsive' | 'head' | 'pwa' | 'perf' | 'compat' | 'modern';

/** Canonical pack order (report sections, JSON output). */
export const PACKS: readonly Pack[] = [
  'runtime',
  'responsive',
  'head',
  'pwa',
  'perf',
  'compat',
  'modern',
] as const;

/** Packs whose checks are all advisory: listed, never graded. */
export const ADVISORY_PACKS: ReadonlySet<Pack> = new Set<Pack>(['perf', 'compat', 'modern']);

/** Packs active on every run unless --pack/`packs` replaces them. `pwa` is detected. */
export const DEFAULT_PACKS: readonly Pack[] = [
  'runtime',
  'responsive',
  'head',
  'perf',
  'compat',
  'modern',
] as const;

export function isPack(v: string): v is Pack {
  return (PACKS as readonly string[]).includes(v);
}

// HTML <head> checks that apply to any page; the others (manifest link,
// theme-color, apple-touch-icon, web-app-capable, splash screens) are PWA.
const HEAD_HTML = new Set(['HTML-02', 'HTML-04', 'HTML-06']);
// UX checks that apply to any page; the others look at the manifest.
const RESPONSIVE_UX = new Set(['UX-03', 'UX-05']);
// Runtime checks about the manifest and the service worker.
const PWA_RUNTIME = new Set(['RUN-02', 'RUN-03']);

/** The pack a check belongs to. */
export function packOf(check: Check): Pack {
  switch (check.category) {
    case 'RuntimeHealth':
      return PWA_RUNTIME.has(check.id) ? 'pwa' : 'runtime';
    case 'Responsiveness':
      return 'responsive';
    case 'Html':
      return HEAD_HTML.has(check.id) ? 'head' : 'pwa';
    case 'UX':
      return RESPONSIVE_UX.has(check.id) ? 'responsive' : 'pwa';
    case 'Manifest':
    case 'Icons':
    case 'ServiceWorker':
    case 'Offline':
    case 'Installability':
    case 'Preflight':
      return 'pwa';
    case 'Performance':
    case 'Lighthouse':
      return 'perf';
    case 'Compatibility':
      return 'compat';
    case 'ModernApis':
      return 'modern';
  }
}

/**
 * `--only` pattern match: a check id, case-insensitive, where `*` matches any
 * run of characters (`RUN-*`, `MAN-0*`, `*`).
 */
export function matchesPattern(id: string, pattern: string): boolean {
  const escaped = pattern
    .trim()
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i').test(id);
}

export interface Selection {
  /** Modules to run, in catalog order. */
  modules: CheckModule[];
  /** ids selected by packs or by --only (reported). */
  selected: Set<string>;
  /** ids pulled in only as dependencies of a selected check. */
  dependencies: Set<string>;
}

/**
 * Select the modules to run: the checks of `packs`, or the checks matching
 * `only` when given, plus the transitive `dependsOn` closure. Dependencies run
 * (their result feeds the dependent check) but are listed separately, so the
 * caller can keep them out of the report when they belong to an inactive pack.
 */
export function selectModules(
  all: readonly CheckModule[],
  opts: { packs: ReadonlySet<Pack>; only?: readonly string[] },
): Selection {
  const byId = new Map(all.map((m) => [m.check.id, m]));
  const selected = new Set<string>();
  for (const m of all) {
    const pick = opts.only
      ? opts.only.some((p) => matchesPattern(m.check.id, p))
      : opts.packs.has(packOf(m.check));
    if (pick) selected.add(m.check.id);
  }

  const dependencies = new Set<string>();
  const visit = (id: string): void => {
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (selected.has(dep) || dependencies.has(dep)) continue;
      if (!byId.has(dep)) continue;
      dependencies.add(dep);
      visit(dep);
    }
  };
  for (const id of selected) visit(id);

  const modules = all.filter((m) => selected.has(m.check.id) || dependencies.has(m.check.id));
  return { modules, selected, dependencies };
}

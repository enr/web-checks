// Shared Tier 1 responsive measurement: navigate each route once, measure every
// breakpoint, cache the snapshots. All RSP-* Tier 1 checks read from here so the
// browser is driven once per (route × breakpoint) (IMPLEMENTATION_PLAN §A.3).

import { type MeasureSnapshot, installPreconditions, measure } from '../../../browser/measure.js';
import type { CheckContext } from '../../../core/module.js';
import type { InputSource } from '../../../loaders/input.js';

const cache = new WeakMap<InputSource, Promise<MeasureSnapshot[]>>();

export function getSnapshots(ctx: CheckContext): Promise<MeasureSnapshot[]> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = collect(ctx);
  cache.set(ctx.input, p);
  return p;
}

async function collect(ctx: CheckContext): Promise<MeasureSnapshot[]> {
  const { browser, config, input, auth } = ctx;
  if (!browser) return [];
  const opts = {
    overflowTolerancePx: config.layout.overflowTolerancePx,
    overlapTolerancePx: config.layout.overlapTolerancePx,
    minTouchTargetPx: config.layout.minTouchTargetPx,
    minFontSizePx: config.layout.minFontSizePx,
    minReadableColWidthPx: config.layout.minReadableColWidthPx,
    ignoreSelectors: config.layout.ignoreSelectors,
  };

  const snapshots: MeasureSnapshot[] = [];
  for (const route of config.routes) {
    const url = input.baseUrl + (route.startsWith('/') ? route : `/${route}`);
    const page = await browser.newPage(auth?.session);
    try {
      await installPreconditions(page);
      await page.goto(url, { waitUntil: 'networkidle' });
      for (const bp of config.breakpoints) {
        snapshots.push(await measure(page, bp, route, opts));
      }
    } finally {
      await page.close();
    }
  }
  return snapshots;
}

/** Instance label used in evidence (e.g. "mobile-s @ /dashboard"). */
export function instanceLabel(s: MeasureSnapshot): string {
  return `${s.breakpoint} @ ${s.route}`;
}

export interface ReflowResult {
  route: string;
  /** Horizontal scrolling required to read content at 320 CSS px equivalent. */
  horizontalScroll: boolean;
  detail: string;
}

const reflowCache = new WeakMap<InputSource, Promise<ReflowResult[]>>();

/**
 * WCAG 1.4.10 Reflow (RSP-11): load at 1280x1024 with 400% page zoom (the
 * canonical way to test 320 CSS px equivalent) and check that no horizontal
 * scroll is needed. layout.ignoreSelectors excludes content that legitimately
 * needs 2D layout (tables, maps, ...).
 */
export function getReflow(ctx: CheckContext): Promise<ReflowResult[]> {
  const cached = reflowCache.get(ctx.input);
  if (cached) return cached;
  const p = collectReflow(ctx);
  reflowCache.set(ctx.input, p);
  return p;
}

async function collectReflow(ctx: CheckContext): Promise<ReflowResult[]> {
  const { browser, config, input, auth } = ctx;
  if (!browser) return [];
  const tol = config.layout.overflowTolerancePx;
  const out: ReflowResult[] = [];
  for (const route of config.routes) {
    const url = input.baseUrl + (route.startsWith('/') ? route : `/${route}`);
    const page = await browser.newPage(auth?.session);
    try {
      await installPreconditions(page);
      await page.setViewport({ width: 1280, height: 1024 });
      await page.goto(url, { waitUntil: 'networkidle' });
      const res = await page.evaluate((arg) => {
        const tolerance = arg as number;
        // biome-ignore lint/suspicious/noExplicitAny: browser context
        const de: any = document.documentElement;
        de.style.zoom = '4';
        void de.offsetWidth; // force reflow
        const scrollWidth = de.scrollWidth;
        const clientWidth = de.clientWidth;
        de.style.zoom = '';
        return { scrollWidth, clientWidth, tolerance };
      }, tol);
      const horizontalScroll = res.scrollWidth > res.clientWidth + res.tolerance;
      out.push({
        route,
        horizontalScroll,
        detail: `scrollWidth=${res.scrollWidth} clientWidth=${res.clientWidth}`,
      });
    } finally {
      await page.close();
    }
  }
  return out;
}

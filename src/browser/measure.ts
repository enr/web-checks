// Deterministic measurement preconditions + a single per-(route×breakpoint)
// snapshot (IMPLEMENTATION_PLAN §A.3, §"RSP-*: un solo evaluate", SPEC
// §"Precondizioni di misura"). All RSP-* read from the shared snapshot; they do
// not each round-trip to the browser.

import type { Breakpoint } from '../core/config.js';
import type { DriverPage } from './driver.js';

export interface MeasureOptions {
  overflowTolerancePx: number;
  overlapTolerancePx: number;
  minTouchTargetPx: number;
  minFontSizePx: number;
  minReadableColWidthPx: number;
  ignoreSelectors: string[];
}

export interface BoxRef {
  tag: string;
  info?: string;
}

export interface MeasureSnapshot {
  breakpoint: string;
  breakpointClass: 'mobile' | 'tablet' | 'desktop';
  route: string;
  viewportWidth: number;
  viewportHeight: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: boolean;
  mediaOverflow: BoxRef[];
  smallTouchTargets: BoxRef[];
  smallFonts: BoxRef[];
  fixedWideElements: BoxRef[];
  overlaps: BoxRef[];
  clipped: BoxRef[];
  /** Number of top-level side-by-side content columns (adaptivity signal). */
  columns: number;
}

/** CSS injected once to freeze layout (disable animations/transitions). */
const FREEZE_CSS = '*{animation:none !important;transition:none !important;}';

/** Install measurement preconditions on the page/context (call before goto). */
export async function installPreconditions(page: DriverPage): Promise<void> {
  const js = `try{const s=document.createElement('style');s.textContent=${JSON.stringify(
    FREEZE_CSS,
  )};document.documentElement.appendChild(s);}catch(e){}`;
  await page.addInitScript(js);
}

/**
 * Set the viewport, wait for layout to settle (fonts + a paint), then run a
 * single evaluate that collects every RSP metric. Deterministic: reads once at
 * a stable layout; excludes hidden / out-of-flow nodes.
 */
export async function measure(
  page: DriverPage,
  breakpoint: Breakpoint,
  route: string,
  opts: MeasureOptions,
): Promise<MeasureSnapshot> {
  await page.setViewport({ width: breakpoint.width, height: breakpoint.height });
  await page.evaluate(async () => {
    // Wait for fonts (web fonts change text metrics) and one animation frame.
    // biome-ignore lint/suspicious/noExplicitAny: browser context
    const d: any = document;
    if (d.fonts?.ready) await d.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });

  const raw = await page.evaluate(collectMetrics, opts);
  return {
    ...(raw as Omit<MeasureSnapshot, 'breakpoint' | 'breakpointClass' | 'route'>),
    breakpoint: breakpoint.name,
    breakpointClass: breakpoint.class,
    route,
  };
}

/**
 * In-browser metric collector. Must be self-contained and serializable — it is
 * stringified and run in the page context (also valid for a future Bun worker).
 */
function collectMetrics(
  arg?: unknown,
): Omit<MeasureSnapshot, 'breakpoint' | 'breakpointClass' | 'route'> {
  const opts = arg as MeasureOptions;
  const doc = document;
  const de = doc.documentElement;
  const vw = de.clientWidth;
  const vh = de.clientHeight;

  const ignore = (el: Element): boolean => {
    for (const sel of opts.ignoreSelectors) {
      try {
        if (el.closest(sel)) return true;
      } catch {
        /* invalid selector — ignore */
      }
    }
    return false;
  };

  const isVisible = (el: Element): boolean => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (s.position === 'fixed' || s.position === 'absolute') return false;
    return true;
  };

  const short = (el: Element): string => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/)[0]}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const scrollWidth = de.scrollWidth;
  const overflowX = scrollWidth > vw + opts.overflowTolerancePx;

  // RSP-07: media exceeding the viewport / their container.
  const mediaOverflow: BoxRef[] = [];
  for (const el of Array.from(doc.querySelectorAll('img,video,canvas,svg,picture'))) {
    if (!isVisible(el) || ignore(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + opts.overflowTolerancePx || r.left < -opts.overflowTolerancePx) {
      mediaOverflow.push({ tag: short(el), info: `right=${Math.round(r.right)} vw=${vw}` });
    }
  }

  // RSP-03: touch targets smaller than the threshold.
  const smallTouchTargets: BoxRef[] = [];
  const interactive = 'a,button,input,select,textarea,[role=button],[onclick]';
  for (const el of Array.from(doc.querySelectorAll(interactive))) {
    if (!isVisible(el) || ignore(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < opts.minTouchTargetPx || r.height < opts.minTouchTargetPx) {
      smallTouchTargets.push({
        tag: short(el),
        info: `${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    }
  }

  // RSP-04: text smaller than the minimum readable size.
  const smallFonts: BoxRef[] = [];
  const seenSizes = new Set<number>();
  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    if (!isVisible(el) || ignore(el)) continue;
    if (!el.textContent || el.textContent.trim().length === 0) continue;
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    if (size > 0 && size < opts.minFontSizePx && !seenSizes.has(size)) {
      seenSizes.add(size);
      smallFonts.push({ tag: short(el), info: `${size}px` });
    }
  }

  // RSP-06: elements with a fixed px width exceeding the viewport.
  const fixedWideElements: BoxRef[] = [];
  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    if (!isVisible(el) || ignore(el)) continue;
    const s = getComputedStyle(el);
    if (s.width.endsWith('px')) {
      const w = Number.parseFloat(s.width);
      if (w > vw + opts.overflowTolerancePx) {
        fixedWideElements.push({ tag: short(el), info: `${Math.round(w)}px > ${vw}` });
      }
    }
  }

  // RSP-10: clipped text (overflow:hidden and content exceeds the box, without
  // an intentional ellipsis / line-clamp).
  const clipped: BoxRef[] = [];
  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    if (!isVisible(el) || ignore(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflow !== 'hidden' && s.overflowX !== 'hidden' && s.overflowY !== 'hidden') continue;
    const intentional =
      s.textOverflow === 'ellipsis' ||
      (s as unknown as { webkitLineClamp?: string }).webkitLineClamp;
    if (intentional && intentional !== 'none') continue;
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
      if ((el.textContent ?? '').trim().length > 0) clipped.push({ tag: short(el) });
    }
  }

  // RSP-09: overlapping leaf text / interactive boxes.
  const overlaps: BoxRef[] = [];
  const leaves = Array.from(doc.querySelectorAll(`p,span,a,button,li,h1,h2,h3,${interactive}`))
    .filter((el) => isVisible(el) && !ignore(el) && (el.textContent ?? '').trim().length > 0)
    .slice(0, 300);
  const rects = leaves.map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (!a || !b) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const tol = opts.overlapTolerancePx;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > tol && oy > tol) {
        overlaps.push({ tag: `${short(a.el)} ∩ ${short(b.el)}` });
        if (overlaps.length > 20) break;
      }
    }
    if (overlaps.length > 20) break;
  }

  // RSP-08 adaptivity: count top-level side-by-side content columns. A single
  // column means already-stacked (valid on mobile); multiple columns on a
  // mobile viewport that overflow indicate a non-reflowing wide layout.
  const body = doc.body;
  let columns = 1;
  if (body) {
    const rows = new Map<number, number>();
    for (const el of Array.from(body.children)) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < opts.minReadableColWidthPx / 2) continue;
      const top = Math.round(r.top / 20) * 20;
      rows.set(top, (rows.get(top) ?? 0) + 1);
    }
    columns = rows.size > 0 ? Math.max(...rows.values()) : 1;
  }

  return {
    viewportWidth: vw,
    viewportHeight: vh,
    scrollWidth,
    clientWidth: vw,
    overflowX,
    mediaOverflow,
    smallTouchTargets,
    smallFonts,
    fixedWideElements,
    overlaps,
    clipped,
    columns,
  };
}

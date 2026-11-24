// Shared per-run icon resolution: for each manifest icon, resolve the file,
// check existence, decode PNG dimensions, and parse sizes/purpose.

import type { InputSource } from '../../../loaders/input.js';
import { type ManifestIcon, loadManifest } from '../manifest/shared.js';
import { type PixelSize, readPngSize } from './png.js';

export interface DeclaredSize {
  width: number;
  height: number;
}

export interface ResolvedIcon {
  icon: ManifestIcon;
  path?: string;
  exists: boolean;
  isPng: boolean;
  realSize?: PixelSize;
  declaredSizes: DeclaredSize[];
  hasAnySize: boolean;
  purposes: Set<string>;
}

const cache = new WeakMap<InputSource, Promise<ResolvedIcon[]>>();

export function resolveIcons(ctx: { input: InputSource }): Promise<ResolvedIcon[]> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = doResolve(ctx.input);
  cache.set(ctx.input, p);
  return p;
}

/** Parse a sizes string like "192x192 512x512" or "any". */
export function parseSizes(sizes: string | undefined): { sizes: DeclaredSize[]; any: boolean } {
  if (!sizes) return { sizes: [], any: false };
  const tokens = sizes.trim().split(/\s+/);
  const out: DeclaredSize[] = [];
  let any = false;
  for (const tok of tokens) {
    if (tok.toLowerCase() === 'any') {
      any = true;
      continue;
    }
    const m = /^(\d+)x(\d+)$/i.exec(tok);
    if (m) out.push({ width: Number(m[1]), height: Number(m[2]) });
  }
  return { sizes: out, any };
}

/** Purpose set; absent purpose is treated as "any" (SPEC §2). */
export function parsePurpose(purpose: string | undefined): Set<string> {
  if (!purpose || purpose.trim().length === 0) return new Set(['any']);
  return new Set(purpose.trim().toLowerCase().split(/\s+/));
}

function isPngSrc(icon: ManifestIcon): boolean {
  if (icon.type) return icon.type.toLowerCase() === 'image/png';
  return (icon.src ?? '').toLowerCase().split(/[?#]/)[0]?.endsWith('.png') ?? false;
}

async function doResolve(input: InputSource): Promise<ResolvedIcon[]> {
  const { json } = await loadManifest({ input });
  const icons = Array.isArray(json?.icons)
    ? (json?.icons as unknown[]).filter(
        (x): x is ManifestIcon => typeof x === 'object' && x !== null,
      )
    : [];

  const out: ResolvedIcon[] = [];
  for (const icon of icons) {
    const { sizes, any } = parseSizes(icon.sizes);
    const purposes = parsePurpose(icon.purpose);
    const isPng = isPngSrc(icon);
    const resolved: ResolvedIcon = {
      icon,
      exists: false,
      isPng,
      declaredSizes: sizes,
      hasAnySize: any,
      purposes,
    };
    if (typeof icon.src === 'string' && icon.src.length > 0) {
      const asset = await input.read(icon.src);
      if (asset) {
        resolved.exists = true;
        resolved.path = asset.path;
        if (isPng) {
          const size = readPngSize(asset.bytes);
          if (size) resolved.realSize = size;
        }
      }
    }
    out.push(resolved);
  }
  return out;
}

/** Icons that can satisfy installability at `dim` px: purpose includes 'any'. */
export function iconForSize(icons: ResolvedIcon[], dim: number): ResolvedIcon | undefined {
  return icons.find(
    (r) =>
      r.purposes.has('any') && r.declaredSizes.some((s) => s.width === dim && s.height === dim),
  );
}

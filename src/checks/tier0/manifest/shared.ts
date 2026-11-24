// Shared per-run manifest resolution + parse + cache (IMPLEMENTATION_PLAN §B.2).
// MAN-01 discovers the file (from the <link> or conventional paths); MAN-02
// validates UTF-8 + JSON + duplicate keys. All MAN-* read from this.

import type { InputSource } from '../../../loaders/input.js';
import { firstLinkByRel, parseHead } from '../html/shared.js';
import { findDuplicateKeys } from './duplicate-keys.js';

export interface ManifestIcon {
  src?: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

export interface ManifestJson {
  name?: unknown;
  short_name?: unknown;
  start_url?: unknown;
  display?: unknown;
  scope?: unknown;
  theme_color?: unknown;
  background_color?: unknown;
  description?: unknown;
  lang?: unknown;
  dir?: unknown;
  orientation?: unknown;
  categories?: unknown;
  id?: unknown;
  icons?: unknown;
  shortcuts?: unknown;
  screenshots?: unknown;
  [key: string]: unknown;
}

export interface ManifestData {
  /** <link rel="manifest"> present in the HTML head. */
  linked: boolean;
  linkHref?: string;
  /** Logical path where the manifest file was found (null = not found). */
  path: string | null;
  found: boolean;
  raw?: string;
  json?: ManifestJson;
  parseError?: string;
  duplicateKeys: string[];
  utf8: { ok: boolean; note?: string };
}

const CONVENTIONAL_PATHS = ['/manifest.webmanifest', '/manifest.json'];
const cache = new WeakMap<InputSource, Promise<ManifestData>>();

export function loadManifest(ctx: { input: InputSource }): Promise<ManifestData> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = doLoad(ctx.input);
  cache.set(ctx.input, p);
  return p;
}

async function doLoad(input: InputSource): Promise<ManifestData> {
  const head = await parseHead({ input });
  const link = firstLinkByRel(head, 'manifest');
  const linkHref = link?.href;

  const candidates = linkHref ? [linkHref, ...CONVENTIONAL_PATHS] : CONVENTIONAL_PATHS;
  let path: string | null = null;
  let bytes: Buffer | undefined;
  for (const cand of candidates) {
    const asset = await input.read(cand);
    if (asset) {
      path = asset.path;
      bytes = asset.bytes;
      break;
    }
  }

  const base: ManifestData = {
    linked: !!linkHref,
    linkHref,
    path,
    found: !!bytes,
    duplicateKeys: [],
    utf8: { ok: true },
  };
  if (!bytes) return base;

  // UTF-8 validation on raw bytes (SPEC / §A.9).
  let hasBom = false;
  let body = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    hasBom = true;
    body = bytes.subarray(3);
  }
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(body);
    base.utf8 = hasBom
      ? { ok: true, note: 'BOM present (tolerated by browsers, discouraged)' }
      : { ok: true };
  } catch {
    base.utf8 = { ok: false, note: 'invalid UTF-8 byte sequence' };
    return base;
  }
  base.raw = raw;

  try {
    base.json = JSON.parse(raw) as ManifestJson;
  } catch (err) {
    base.parseError = err instanceof Error ? err.message : String(err);
    return base;
  }

  base.duplicateKeys = findDuplicateKeys(raw);
  return base;
}

/** Normalize the manifest icons array into a typed list. */
export function manifestIcons(m: ManifestJson | undefined): ManifestIcon[] {
  if (!m || !Array.isArray(m.icons)) return [];
  return (m.icons as unknown[]).filter(
    (x): x is ManifestIcon => typeof x === 'object' && x !== null,
  );
}

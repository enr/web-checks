// Mode auto-detection, combination and precedence.
// Rules from IMPLEMENTATION_PLAN §A.9 ("Auto-detect del modo") and SPEC §Modalità.

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Mode } from './check.js';

/** Precedence from most to least informative (SPEC §A.5). */
export const MODE_PRECEDENCE: Record<Mode, number> = { live: 3, build: 2, source: 1 };

export interface ResolvedTarget {
  mode: Mode;
  target: string;
  /** Human-readable reason for the report ("auto-detected: build, hashed assets"). */
  reason: string;
}

/** Regex for hashed build assets, e.g. app.4f3a9b2c.js */
const HASHED_ASSET = /\.[0-9a-f]{8,}\.(?:js|css|woff2?)/i;

function isUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Auto-detect the mode of a single target (IMPLEMENTATION_PLAN §A.9):
 * 1. parsable as http(s) URL → live;
 * 2. folder with index.html AND (no package.json OR HTML references hashed
 *    assets) → build;
 * 3. otherwise → source.
 */
export async function detectMode(target: string): Promise<{ mode: Mode; reason: string }> {
  if (isUrl(target)) return { mode: 'live', reason: 'target is an http(s) URL' };

  const indexPath = join(target, 'index.html');
  const hasIndex = await fileExists(indexPath);
  if (hasIndex) {
    const hasPackageJson = await fileExists(join(target, 'package.json'));
    if (!hasPackageJson) {
      return { mode: 'build', reason: 'index.html present and no package.json' };
    }
    let html = '';
    try {
      html = await readFile(indexPath, 'utf8');
    } catch {
      html = '';
    }
    if (HASHED_ASSET.test(html)) {
      return { mode: 'build', reason: 'index.html references hashed assets' };
    }
  }
  return { mode: 'source', reason: 'no build signature (index.html / hashed assets)' };
}

export class ModeError extends Error {}

/**
 * Resolve positional targets to concrete (mode, target) pairs.
 * `explicit` is the parsed --mode list, matched to targets in order.
 * Two targets resolving to the same mode is a usage error (exit 1).
 */
export async function resolveModes(
  targets: string[],
  explicit?: Mode[],
): Promise<ResolvedTarget[]> {
  if (targets.length === 0) {
    throw new ModeError('no target provided');
  }
  if (explicit && explicit.length > 0 && explicit.length !== targets.length) {
    throw new ModeError(
      `--mode list length (${explicit.length}) does not match the number of targets (${targets.length})`,
    );
  }

  const resolved: ResolvedTarget[] = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i] as string;
    const forced = explicit?.[i];
    if (forced) {
      resolved.push({ mode: forced, target, reason: `forced via --mode=${forced}` });
    } else {
      const { mode, reason } = await detectMode(target);
      resolved.push({ mode, target, reason: `auto-detected: ${mode} (${reason})` });
    }
  }

  const seen = new Map<Mode, string>();
  for (const r of resolved) {
    const prev = seen.get(r.mode);
    if (prev !== undefined) {
      throw new ModeError(
        `two targets resolve to the same mode '${r.mode}': '${prev}' and '${r.target}'`,
      );
    }
    seen.set(r.mode, r.target);
  }
  return resolved;
}

/** Parse a comma-separated --mode value into Mode[]. Throws on invalid tokens. */
export function parseModeFlag(raw: string): Mode[] {
  const valid: Mode[] = ['source', 'build', 'live'];
  return raw.split(',').map((tok) => {
    const m = tok.trim() as Mode;
    if (!valid.includes(m)) {
      throw new ModeError(`invalid mode '${tok.trim()}' (expected source|build|live)`);
    }
    return m;
  });
}

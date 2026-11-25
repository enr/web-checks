// Session files on disk (SPEC §"Caching"):
// - the cache (`auth.cache`): storageState with a TTL, lets repeat runs skip
//   the login; invalidated on TTL expiry, on --refresh-auth, or when the
//   session no longer passes the login-wall guard;
// - a recorded session (`auth.storageState`, written by `web-checks auth
//   record`): same shape, no TTL. A plain Playwright storageState file
//   (`{ cookies, origins }`) is accepted too.
// Both hold live credentials: written with mode 0600.

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StorageState } from './types.js';

export interface SessionFile {
  /** Format marker of files written by web-checks. */
  tool?: 'web-checks';
  savedAt: number;
  /** The URL the session was recorded on (record only). */
  url?: string;
  storageState: StorageState;
}

function isStorageState(v: unknown): v is StorageState {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as StorageState).cookies) &&
    Array.isArray((v as StorageState).origins)
  );
}

/** Parse a session file; throws with a readable message when it is not one. */
export function parseSessionFile(raw: string): SessionFile {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed === 'object' && parsed !== null && 'storageState' in parsed) {
    const file = parsed as SessionFile;
    if (isStorageState(file.storageState)) return file;
  }
  if (isStorageState(parsed)) return { savedAt: 0, storageState: parsed };
  throw new Error('not a session file (expected { storageState } or { cookies, origins })');
}

export async function readSessionFile(path: string): Promise<SessionFile> {
  return parseSessionFile(await readFile(path, 'utf8'));
}

export async function writeSessionFile(
  path: string,
  storageState: StorageState,
  extra: { url?: string } = {},
): Promise<void> {
  const data: SessionFile = { tool: 'web-checks', savedAt: Date.now(), ...extra, storageState };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  // writeFile's mode applies only on creation.
  await chmod(path, 0o600).catch(() => {});
}

export async function readAuthCache(path: string, ttlMs: number): Promise<StorageState | null> {
  try {
    const parsed = await readSessionFile(path);
    if (Date.now() - parsed.savedAt > ttlMs) return null;
    return parsed.storageState;
  } catch {
    return null;
  }
}

export async function writeAuthCache(path: string, storageState: StorageState): Promise<void> {
  await writeSessionFile(path, storageState);
}

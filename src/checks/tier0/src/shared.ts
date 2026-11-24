// Shared helpers for the source-mode pre-flight smoke checks (SRC-01..03).

import type { InputSource } from '../../../loaders/input.js';

const STATIC_DIRS = ['/public', '/static', ''];
const MANIFEST_NAMES = ['/manifest.webmanifest', '/manifest.json'];
const SW_NAMES = ['/sw.js', '/service-worker.js', '/serviceworker.js'];
const PWA_PLUGINS = ['vite-plugin-pwa', 'next-pwa', 'workbox', '@angular/pwa', 'serwist'];

async function firstExisting(
  input: InputSource,
  dirs: string[],
  names: string[],
): Promise<string | null> {
  for (const dir of dirs) {
    for (const name of names) {
      const path = `${dir}${name}`;
      if (await input.exists(path)) return path;
    }
  }
  return null;
}

export function findStaticManifest(input: InputSource): Promise<string | null> {
  return firstExisting(input, STATIC_DIRS, MANIFEST_NAMES);
}

export function findStaticSw(input: InputSource): Promise<string | null> {
  return firstExisting(input, STATIC_DIRS, SW_NAMES);
}

/** PWA plugin declared in package.json dependencies/devDependencies. */
export async function findPwaPlugin(input: InputSource): Promise<string | null> {
  const asset = await input.read('/package.json');
  if (!asset) return null;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(asset.bytes.toString('utf8'));
  } catch {
    return null;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(deps)) {
    if (PWA_PLUGINS.some((p) => name.includes(p))) return name;
  }
  return null;
}

const SOURCE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte)$/i;
const REGISTER_RE = /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/;

/** Scan source files for a serviceWorker.register(...) call (capped). */
export async function findRegisterCall(input: InputSource): Promise<string | null> {
  const files = (await input.list()).filter((f) => SOURCE_EXT.test(f)).slice(0, 500);
  for (const file of files) {
    const asset = await input.read(file);
    if (!asset) continue;
    if (REGISTER_RE.test(asset.bytes.toString('utf8'))) return file;
  }
  return null;
}

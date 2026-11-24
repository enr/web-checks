// PWA detection (SPEC §"Perimetro e pacchetti"): the `pwa` pack is active by
// default only when the target looks like a Progressive Web App. Reuses the
// same helpers as MAN-01/SRC-01 (loadManifest is cached per InputSource, so
// detection costs no extra request when the same input then runs the checks).

import type { InputSource } from '../loaders/input.js';
import { loadManifest } from './tier0/manifest/shared.js';
import { findPwaPlugin, findStaticManifest } from './tier0/src/shared.js';

export interface PwaDetection {
  detected: boolean;
  /** What was found (or looked for), for the report. */
  evidence: string;
}

export async function detectPwa(input: InputSource): Promise<PwaDetection> {
  if (input.mode === 'source') {
    const manifest = await findStaticManifest(input);
    if (manifest) return { detected: true, evidence: `manifest ${manifest}` };
    const plugin = await findPwaPlugin(input);
    if (plugin) return { detected: true, evidence: `PWA plugin ${plugin} in package.json` };
    return { detected: false, evidence: 'no static manifest and no PWA plugin' };
  }
  const m = await loadManifest({ input });
  if (m.linked) return { detected: true, evidence: `<link rel="manifest" href="${m.linkHref}">` };
  if (m.found) return { detected: true, evidence: `manifest ${m.path}` };
  return { detected: false, evidence: 'no web app manifest (linked or at a conventional path)' };
}

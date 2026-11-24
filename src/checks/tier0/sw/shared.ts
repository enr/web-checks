// Shared per-run Service Worker discovery + static analysis (acorn AST).
// IMPLEMENTATION_PLAN §"Rilevamento SW & analisi eventi".

import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import type { InputSource } from '../../../loaders/input.js';
import { parseHead } from '../html/shared.js';

const CONVENTIONAL_SW = ['/sw.js', '/service-worker.js', '/serviceworker.js'];

export interface SwAnalysis {
  workboxGenerated: boolean;
  events: Set<'install' | 'fetch' | 'activate'>;
  usesCacheApi: boolean;
  cacheNames: string[];
  skipWaiting: boolean;
  clientsClaim: boolean;
  /** Old caches deleted in the activate handler (OFF-04). */
  cleansOldCaches: boolean;
  /** Best-effort offline strategy label (SW-07, info). */
  strategy?: string;
}

export interface SwData {
  /** SW file found (registration arg or conventional path). */
  found: boolean;
  path?: string;
  raw?: string;
  /** navigator.serviceWorker.register(...) found in an entry bundle. */
  registered: boolean;
  registrationArg?: string;
  analysis: SwAnalysis;
}

const cache = new WeakMap<InputSource, Promise<SwData>>();

export function loadServiceWorker(ctx: { input: InputSource }): Promise<SwData> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = doLoad(ctx.input);
  cache.set(ctx.input, p);
  return p;
}

function emptyAnalysis(): SwAnalysis {
  return {
    workboxGenerated: false,
    events: new Set(),
    usesCacheApi: false,
    cacheNames: [],
    skipWaiting: false,
    clientsClaim: false,
    cleansOldCaches: false,
  };
}

/** Parse JS trying module then script; null if both fail. */
function tryParse(code: string): ReturnType<typeof parse> | null {
  for (const sourceType of ['module', 'script'] as const) {
    try {
      return parse(code, { ecmaVersion: 'latest', sourceType });
    } catch {
      // try next
    }
  }
  return null;
}

/** Regex fallback to find navigator.serviceWorker.register('url'). */
const REGISTER_RE = /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(\s*['"`]([^'"`]+)['"`]/;

async function findRegistration(
  input: InputSource,
): Promise<{ registered: boolean; arg?: string }> {
  const head = await parseHead({ input });
  for (const src of head.scripts) {
    const asset = await input.read(src);
    if (!asset) continue;
    const code = asset.bytes.toString('utf8');
    const m = REGISTER_RE.exec(code);
    if (m) return { registered: true, arg: m[1] };
    if (/navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/.test(code)) {
      return { registered: true };
    }
  }
  return { registered: false };
}

async function doLoad(input: InputSource): Promise<SwData> {
  const { registered, arg } = await findRegistration(input);

  const candidates = arg ? [arg, ...CONVENTIONAL_SW] : CONVENTIONAL_SW;
  let path: string | undefined;
  let raw: string | undefined;
  for (const cand of candidates) {
    const asset = await input.read(cand);
    if (asset) {
      path = asset.path;
      raw = asset.bytes.toString('utf8');
      break;
    }
  }

  const analysis = raw ? analyzeSw(raw) : emptyAnalysis();
  return { found: !!raw, path, raw, registered, registrationArg: arg, analysis };
}

/** Static analysis of a Service Worker source. Exported for direct testing. */
export function analyzeSw(code: string): SwAnalysis {
  const analysis = emptyAnalysis();

  // Workbox / plugin signatures — check first (SPEC §4).
  if (
    /workbox/i.test(code) ||
    /\bprecacheAndRoute\b/.test(code) ||
    /\bregisterRoute\b/.test(code)
  ) {
    analysis.workboxGenerated = true;
  }
  // Precache manifest array [{url, revision}] is a generated-SW signature.
  if (/self\.__WB_MANIFEST|\[\s*\{\s*["']?url["']?\s*:/.test(code)) {
    analysis.workboxGenerated = true;
  }

  const ast = tryParse(code);
  if (!ast) {
    // Regex fallback for the essentials.
    fallbackAnalyze(code, analysis);
    return finalizeStrategy(code, analysis);
  }

  // First pass: map const/let string identifiers to their value so that
  // caches.open(CACHE) can be resolved to its cache name.
  const constStrings = new Map<string, string>();
  simple(ast, {
    VariableDeclarator(node) {
      if (
        node.id.type === 'Identifier' &&
        node.init?.type === 'Literal' &&
        typeof node.init.value === 'string'
      ) {
        constStrings.set(node.id.name, node.init.value);
      }
    },
  });

  simple(ast, {
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        const prop = callee.property.name;
        const objName = callee.object.type === 'Identifier' ? callee.object.name : undefined;

        if (prop === 'addEventListener') {
          const first = node.arguments[0];
          if (first && first.type === 'Literal' && typeof first.value === 'string') {
            addEvent(analysis, first.value);
          }
        }
        if (objName === 'caches' && prop === 'open') {
          analysis.usesCacheApi = true;
          const first = node.arguments[0];
          if (first && first.type === 'Literal' && typeof first.value === 'string') {
            analysis.cacheNames.push(first.value);
          } else if (first && first.type === 'Identifier') {
            const resolved = constStrings.get(first.name);
            if (resolved) analysis.cacheNames.push(resolved);
          }
        }
        if (prop === 'addAll' || prop === 'put' || prop === 'match' || prop === 'delete') {
          if (objName === 'caches' || /cache/i.test(objName ?? '') || prop === 'addAll') {
            analysis.usesCacheApi = true;
          }
        }
        if (prop === 'skipWaiting') analysis.skipWaiting = true;
        if (prop === 'claim') analysis.clientsClaim = true;
        if (prop === 'precacheAndRoute' || prop === 'registerRoute') {
          analysis.workboxGenerated = true;
        }
      }
      if (callee.type === 'Identifier') {
        if (callee.name === 'skipWaiting') analysis.skipWaiting = true;
        if (callee.name === 'importScripts') {
          const first = node.arguments[0];
          if (first && first.type === 'Literal' && /workbox/i.test(String(first.value))) {
            analysis.workboxGenerated = true;
          }
        }
      }
    },
    AssignmentExpression(node) {
      // self.onfetch = ... / onfetch = ...
      const left = node.left;
      if (left.type === 'MemberExpression' && left.property.type === 'Identifier') {
        matchOnHandler(analysis, left.property.name);
      }
      if (left.type === 'Identifier') matchOnHandler(analysis, left.name);
    },
  });

  // Cache cleanup in activate (OFF-04): activate handler + caches.delete/keys.
  if (analysis.events.has('activate') && /caches\s*\.\s*(delete|keys)\s*\(/.test(code)) {
    analysis.cleansOldCaches = true;
  }

  return finalizeStrategy(code, analysis);
}

function addEvent(a: SwAnalysis, ev: string): void {
  if (ev === 'install' || ev === 'fetch' || ev === 'activate') a.events.add(ev);
}

function matchOnHandler(a: SwAnalysis, name: string): void {
  if (name === 'onfetch') a.events.add('fetch');
  if (name === 'oninstall') a.events.add('install');
  if (name === 'onactivate') a.events.add('activate');
}

function fallbackAnalyze(code: string, a: SwAnalysis): void {
  if (/addEventListener\(\s*['"`]fetch/.test(code) || /self\.onfetch\s*=/.test(code)) {
    a.events.add('fetch');
  }
  if (/addEventListener\(\s*['"`]install/.test(code) || /self\.oninstall\s*=/.test(code)) {
    a.events.add('install');
  }
  if (/addEventListener\(\s*['"`]activate/.test(code) || /self\.onactivate\s*=/.test(code)) {
    a.events.add('activate');
  }
  if (/caches\.(open|match|delete)|\.addAll\(|\.put\(/.test(code)) a.usesCacheApi = true;
  if (/skipWaiting\s*\(/.test(code)) a.skipWaiting = true;
  if (/clients\s*\.\s*claim\s*\(/.test(code)) a.clientsClaim = true;
}

/** Best-effort offline strategy (SW-07, info) — do not chase precision. */
function finalizeStrategy(code: string, a: SwAnalysis): SwAnalysis {
  if (a.workboxGenerated) {
    a.strategy = 'managed by Workbox/plugin';
    return a;
  }
  if (!a.events.has('fetch')) return a;
  const matchFirst = /caches\.match/.test(code);
  const fetchUsed = /\bfetch\s*\(/.test(code);
  if (matchFirst && fetchUsed) {
    // Rough heuristic: caches.match appearing before fetch -> Cache First.
    a.strategy =
      code.indexOf('caches.match') < code.indexOf('fetch(') ? 'Cache First' : 'Network First';
  } else if (matchFirst) {
    a.strategy = 'Cache Only';
  } else if (fetchUsed) {
    a.strategy = 'Network Only';
  }
  return a;
}

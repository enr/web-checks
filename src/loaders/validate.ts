// Hand-written config validation (IMPLEMENTATION_PLAN §B.3 — no zod, per the
// dependency guardrail A.8). Reports unknown keys (typo -> usage error),
// type-checks fields, accumulates ALL errors, and rejects the reserved
// includeAdvisoryInScore key (SPEC §Backlog D3).

import { PACKS, isPack } from '../core/packs.js';

export interface UserConfig {
  breakpoints?: unknown;
  layout?: unknown;
  runtime?: unknown;
  timeouts?: unknown;
  perf?: unknown;
  weights?: unknown;
  ignore?: unknown;
  packs?: unknown;
  routes?: unknown;
  auth?: unknown;
  lighthouse?: unknown;
  failBelowGrade?: unknown;
  baseUrl?: unknown;
  startUrl?: unknown;
  scope?: unknown;
  mode?: unknown;
}

const KNOWN_KEYS = new Set([
  'breakpoints',
  'layout',
  'runtime',
  'timeouts',
  'perf',
  'weights',
  'ignore',
  'packs',
  'routes',
  'auth',
  'lighthouse',
  'failBelowGrade',
  'baseUrl',
  'startUrl',
  'scope',
  'mode',
]);

const GRADES = new Set(['A', 'B', 'C', 'D', 'E', 'F']);

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export interface ValidationResult {
  config?: UserConfig;
  errors: string[];
}

export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { errors: ['config must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (key === 'includeAdvisoryInScore') {
      errors.push(
        'config key "includeAdvisoryInScore" is reserved and not yet supported (lands in v1.x)',
      );
      continue;
    }
    if (key === 'minGrade') {
      errors.push('config key "minGrade" was renamed "failBelowGrade" (it now enables the gate)');
      continue;
    }
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`unknown config key "${key}"`);
    }
  }

  if ('ignore' in obj && !isStringArray(obj.ignore))
    errors.push('"ignore" must be an array of strings');
  if ('packs' in obj) {
    if (!isStringArray(obj.packs)) {
      errors.push('"packs" must be an array of strings');
    } else {
      for (const p of obj.packs as string[]) {
        if (!isPack(p))
          errors.push(`unknown pack "${p}" in "packs" (expected: ${PACKS.join(', ')})`);
      }
    }
  }
  if ('routes' in obj && !isStringArray(obj.routes))
    errors.push('"routes" must be an array of strings');
  if ('lighthouse' in obj && typeof obj.lighthouse !== 'boolean')
    errors.push('"lighthouse" must be a boolean');
  if ('baseUrl' in obj && typeof obj.baseUrl !== 'string')
    errors.push('"baseUrl" must be a string');
  if ('startUrl' in obj && typeof obj.startUrl !== 'string')
    errors.push('"startUrl" must be a string');
  if ('scope' in obj && typeof obj.scope !== 'string') errors.push('"scope" must be a string');
  if (
    'failBelowGrade' in obj &&
    (typeof obj.failBelowGrade !== 'string' || !GRADES.has(obj.failBelowGrade))
  ) {
    errors.push('"failBelowGrade" must be one of A,B,C,D,E,F');
  }
  if ('weights' in obj) {
    const w = obj.weights;
    if (typeof w !== 'object' || w === null || Array.isArray(w)) {
      errors.push('"weights" must be an object of category -> number');
    } else if (!Object.values(w).every((v) => typeof v === 'number')) {
      errors.push('"weights" values must be numbers');
    }
  }
  for (const sub of ['layout', 'runtime', 'timeouts', 'perf', 'auth'] as const) {
    if (
      sub in obj &&
      (typeof obj[sub] !== 'object' || obj[sub] === null || Array.isArray(obj[sub]))
    ) {
      errors.push(`"${sub}" must be an object`);
    }
  }
  if ('breakpoints' in obj && !Array.isArray(obj.breakpoints)) {
    errors.push('"breakpoints" must be an array');
  }
  if (isObject(obj.auth)) validateAuth(obj.auth, errors);

  return errors.length > 0 ? { errors } : { config: obj as UserConfig, errors: [] };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const AUTH_KEYS = new Set([
  'module',
  'headers',
  'cache',
  'refresh',
  'storageState',
  'ready',
  'httpCredentials',
]);

function validateAuth(auth: Record<string, unknown>, errors: string[]): void {
  for (const key of Object.keys(auth)) {
    if (!AUTH_KEYS.has(key)) errors.push(`unknown config key "auth.${key}"`);
  }
  for (const key of ['module', 'storageState'] as const) {
    if (key in auth && typeof auth[key] !== 'string') errors.push(`"auth.${key}" must be a string`);
  }
  if ('refresh' in auth && typeof auth.refresh !== 'boolean') {
    errors.push('"auth.refresh" must be a boolean');
  }
  if ('headers' in auth) {
    const h = auth.headers;
    if (!isObject(h) || !Object.values(h).every((v) => typeof v === 'string')) {
      errors.push('"auth.headers" must be an object of header -> string');
    }
  }
  if ('cache' in auth) {
    const c = auth.cache;
    if (
      !isObject(c) ||
      typeof c.path !== 'string' ||
      typeof c.ttl !== 'number' ||
      !(c.ttl > 0) ||
      Object.keys(c).some((k) => k !== 'path' && k !== 'ttl')
    ) {
      errors.push('"auth.cache" must be { path: string, ttl: number of ms > 0 }');
    }
  }
  if ('ready' in auth) {
    const r = auth.ready;
    if (
      !isObject(r) ||
      (r.url === undefined && r.selector === undefined) ||
      (r.url !== undefined && typeof r.url !== 'string') ||
      (r.selector !== undefined && typeof r.selector !== 'string') ||
      (r.timeoutMs !== undefined && typeof r.timeoutMs !== 'number') ||
      Object.keys(r).some((k) => !['url', 'selector', 'timeoutMs'].includes(k))
    ) {
      errors.push(
        '"auth.ready" must be { url?: glob, selector?: css, timeoutMs?: number } with url or selector',
      );
    }
  }
  if ('httpCredentials' in auth) {
    const c = auth.httpCredentials;
    if (
      !isObject(c) ||
      typeof c.username !== 'string' ||
      typeof c.password !== 'string' ||
      Object.keys(c).some((k) => k !== 'username' && k !== 'password')
    ) {
      errors.push('"auth.httpCredentials" must be { username: string, password: string }');
    }
  }
}

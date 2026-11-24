// Test harness: run a single check (with its transitive dependencies) against a
// fixture and return the Finding for that check id. IMPLEMENTATION_PLAN §B.2.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Finding, Mode } from '../../src/core/check.js';
import { runMode } from '../../src/core/engine.js';
import { ConsoleLogger, SecretRegistry } from '../../src/core/logger.js';
import type { CheckModule } from '../../src/core/module.js';
import { ALL_CHECKS } from '../../src/core/registry.js';
import { resolveConfig } from '../../src/loaders/config.js';
import { FsSource } from '../../src/loaders/input.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Resolve a fixture directory. `<name>` or `<name>/<sub>` (e.g. build). */
export function fixturePath(name: string): string {
  return join(FIXTURES, name);
}

function collectWithDeps(checkId: string): CheckModule[] {
  const byId = new Map(ALL_CHECKS.map((m) => [m.check.id, m]));
  const out = new Map<string, CheckModule>();
  const visit = (id: string): void => {
    if (out.has(id)) return;
    const mod = byId.get(id);
    if (!mod) return;
    out.set(id, mod);
    for (const dep of mod.dependsOn ?? []) visit(dep);
  };
  visit(checkId);
  return [...out.values()];
}

export interface RunSingleOptions {
  mode?: Mode;
  /** Fixture subfolder, defaults to none (fixture root is the target). */
  sub?: string;
  ignore?: string[];
}

/**
 * Run `checkId` (and only its dependency subtree) against `fixture` and return
 * the aggregated Finding for `checkId`.
 */
export async function runSingleCheck(
  fixture: string,
  checkId: string,
  opts: RunSingleOptions = {},
): Promise<Finding> {
  const mode = opts.mode ?? 'build';
  const root = opts.sub ? join(fixturePath(fixture), opts.sub) : fixturePath(fixture);
  const input = new FsSource(root, mode);
  const config = resolveConfig({ targets: [{ mode, target: root }], ignore: opts.ignore });
  const log = new ConsoleLogger(new SecretRegistry(), 'error');

  const modules = collectWithDeps(checkId);
  const findings = await runMode(modules, { input, config, log });
  const finding = findings.find((f) => f.check.id === checkId);
  if (!finding) {
    throw new Error(`check ${checkId} not found in catalog`);
  }
  return finding;
}

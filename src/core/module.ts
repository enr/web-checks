// CheckModule — the single contract every check implements
// (IMPLEMENTATION_PLAN §A.2), plus ResultBag for inter-check dependencies (§A.4).

import type { AuthRuntime } from '../auth/types.js';
import type { BrowserDriver } from '../browser/driver.js';
import type { InputSource } from '../loaders/input.js';
import type { Check, Finding } from './check.js';
import type { ResolvedConfig } from './config.js';
import type { Logger } from './logger.js';

/**
 * Read-only view of Findings already produced, used to express dependencies
 * between checks without coupling them (IMPLEMENTATION_PLAN §A.4).
 */
export interface ResultBag {
  /** undefined = not yet executed / not applicable. */
  get(id: string): Finding | undefined;
  /** false if absent or not 'pass'. */
  passed(id: string): boolean;
}

export interface CheckContext {
  input: InputSource;
  config: ResolvedConfig;
  /** Present only for Tier 1/2 checks. */
  browser?: BrowserDriver;
  /** Authenticated session, if available. */
  auth?: AuthRuntime;
  results: ResultBag;
  log: Logger;
}

export interface CheckModule {
  /** Static metadata (SPEC §"Data model"). */
  check: Check;
  /** ids of other checks; the engine topologically sorts on them (§A.4). */
  dependsOn?: string[];
  run(ctx: CheckContext): Promise<Finding | Finding[]>;
}

/** Mutable ResultBag implementation backed by a Map keyed on check id. */
export class MapResultBag implements ResultBag {
  private readonly byId = new Map<string, Finding>();

  set(finding: Finding): void {
    // For multi-instance checks the aggregated finding is stored once; the
    // engine performs worst-of aggregation before calling set().
    this.byId.set(finding.check.id, finding);
  }

  get(id: string): Finding | undefined {
    return this.byId.get(id);
  }

  passed(id: string): boolean {
    return this.byId.get(id)?.status === 'pass';
  }
}

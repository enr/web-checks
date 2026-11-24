// The single, sanctioned way to build a Finding (IMPLEMENTATION_PLAN §A.2).
// Checks must never assemble Finding objects by hand.

import type { Check, Finding, SkipReason } from './check.js';

export function pass(check: Check, message = 'OK', evidence?: string): Finding {
  return { check, status: 'pass', message, evidence };
}

export function warn(check: Check, message: string, fix: string, evidence?: string): Finding {
  return { check, status: 'warning', message, fix, evidence };
}

export function fail(check: Check, message: string, fix: string, evidence?: string): Finding {
  return { check, status: 'error', message, fix, evidence };
}

export function info(check: Check, message: string, fix?: string, evidence?: string): Finding {
  return { check, status: 'info', message, fix, evidence };
}

export function skip(check: Check, reason: SkipReason, message?: string): Finding {
  return {
    check,
    status: 'skipped',
    message: message ?? skipMessage(reason),
    skipReason: reason,
  };
}

function skipMessage(reason: SkipReason): string {
  switch (reason) {
    case 'mode':
      return 'Not applicable in the current mode';
    case 'no-browser':
      return 'Requires a browser (Playwright) which is not available';
    case 'dependency':
      return 'Skipped because a prerequisite check did not pass';
    case 'auth-required':
      return 'Resource is behind authentication';
    case 'disabled':
      return 'Disabled via configuration';
    case 'advisory-preflight':
      return 'Advisory pre-flight result (source mode), excluded from the score';
  }
}

/**
 * Effective intra-category weight of a check for scoring.
 * Explicit `weight` wins; otherwise derived from severity: error = 3, warning = 1.
 * `info` has no weight and does not enter the score (SPEC §"Peso dei controlli").
 */
export function effectiveWeight(check: Check): number {
  if (check.weight !== undefined) return check.weight;
  switch (check.severity) {
    case 'error':
      return 3;
    case 'warning':
      return 1;
    case 'info':
      return 0;
  }
}

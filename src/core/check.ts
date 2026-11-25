// Core data model for a check and its outcome.
// Direct translation of SPEC §"Check data model (Finding)".
// These are load-bearing contracts (IMPLEMENTATION_PLAN §A.2) — do not reinvent
// them inside individual checks.

/** Input mode. The mode determines which checks are applicable. */
export type Mode = 'source' | 'build' | 'live';

/**
 * Check category. Report sections follow this order (SPEC §"Deterministic
 * report ordering"); within a section, findings sort by check id.
 */
export type Category =
  | 'Preflight' // SRC-* advisory smoke checks (source mode), unweighted
  | 'Manifest'
  | 'Icons'
  | 'Html'
  | 'ServiceWorker'
  | 'Offline'
  | 'Installability'
  | 'Responsiveness'
  | 'RuntimeHealth'
  | 'UX'
  | 'ModernApis' // advisory, not scored
  | 'Compatibility' // advisory, not scored
  | 'Performance' // advisory in v1
  | 'Lighthouse'; // Tier 2, advisory, opt-in

/**
 * Canonical category order for the report and for scoring normalization.
 * Scored categories only appear in the weight table (SPEC §"Scoring
 * system"); advisory categories are listed here for report ordering.
 */
export const CATEGORY_ORDER: readonly Category[] = [
  'Manifest',
  'Icons',
  'Html',
  'ServiceWorker',
  'Offline',
  'Installability',
  'Responsiveness',
  'RuntimeHealth',
  'UX',
  'Performance',
  'ModernApis',
  'Compatibility',
  'Lighthouse',
  'Preflight',
] as const;

export type Tier = 0 | 1 | 2;

export type Severity = 'error' | 'warning' | 'info';

export interface Check {
  /** e.g. "MAN-01" */
  id: string;
  category: Category;
  title: string;
  /** Modes in which the check is applicable. */
  modes: Mode[];
  tier: Tier;
  severity: Severity;
  /**
   * Intra-category weight. If absent it is derived from severity
   * (error = 3, warning = 1; info has no weight). See SPEC §"Check weight".
   */
  weight?: number;
  /** If failed, caps the grade to F (SPEC §"Blocker cap"). */
  blocking?: boolean;
  deterministic: boolean;
}

/** Why a check produced `skipped` rather than a real outcome. */
export type SkipReason =
  | 'mode' // not applicable to the current mode
  | 'no-browser' // Tier 1/2 without Playwright available
  | 'dependency' // a dependency failed/absent (e.g. ICO-06 when HTML-05 fails)
  | 'auth-required' // resource behind login (SPEC §Authentication)
  | 'disabled' // excluded via config `ignore`
  | 'advisory-preflight'; // source-mode outcome, out of the score

export type FindingStatus = 'pass' | 'warning' | 'error' | 'info' | 'skipped';

export interface Finding {
  check: Check;
  status: FindingStatus;
  /** Description of the problem found. */
  message: string;
  /** Fix suggestion — mandatory when status is warning/error. */
  fix?: string;
  /** file:line / snippet / URL proving the outcome. */
  evidence?: string;
  /** Present iff status === 'skipped'. */
  skipReason?: SkipReason;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

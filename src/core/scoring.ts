// Scoring: category weights, per-mode normalization, blocker cap, A–F grade.
// SPEC §"Sistema di punteggio". Verified against golden fixtures in Phase 1.

import type { Category, Finding, Grade } from './check.js';
import type { ResolvedConfig } from './config.js';
import { DEFAULT_WEIGHTS } from './config.js';
import { effectiveWeight } from './finding.js';

export interface CategoryScore {
  category: Category;
  /** Weighted fraction passed in [0,1], or null if no applicable checks. */
  ratio: number | null;
  /** Normalized category weight actually contributing to the score. */
  weight: number;
  applicableWeight: number;
  passedWeight: number;
}

export interface ScoreResult {
  /** Integer percentage 0–100. */
  score: number;
  grade: Grade;
  /** id of the blocking check that capped the grade to F, if any. */
  cappedByBlocker?: string;
  categories: CategoryScore[];
}

const GRADE_BANDS: { grade: Grade; min: number }[] = [
  { grade: 'A', min: 95 },
  { grade: 'B', min: 85 },
  { grade: 'C', min: 70 },
  { grade: 'D', min: 55 },
  { grade: 'E', min: 40 },
  { grade: 'F', min: 0 },
];

const GRADE_ORDER: readonly Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** True when `grade` meets or beats `min` (A is best). Used by the --fail-below-grade gate. */
export function gradeAtLeast(grade: Grade, min: Grade): boolean {
  return GRADE_ORDER.indexOf(grade) <= GRADE_ORDER.indexOf(min);
}

export function gradeFromScore(score: number): Grade {
  for (const band of GRADE_BANDS) {
    if (score >= band.min) return band.grade;
  }
  return 'F';
}

/** A finding counts toward the score only if it is a real error/warning outcome. */
function isScorable(f: Finding): boolean {
  if (f.status === 'skipped') return false;
  return f.check.severity === 'error' || f.check.severity === 'warning';
}

/** True when at least one finding counts toward a score (otherwise there is no grade). */
export function hasScorable(findings: Finding[]): boolean {
  return findings.some(isScorable);
}

/**
 * Compute the score from the fused findings.
 * Steps (SPEC §Calcolo):
 * 1. keep only error/warning checks applicable and not skipped;
 * 2. per category: passedWeight / applicableWeight;
 * 3. redistribute the weight of categories with no applicable checks;
 * 4. cap to F when a blocking check fails.
 */
export function computeScore(findings: Finding[], config: ResolvedConfig): ScoreResult {
  const weights = { ...DEFAULT_WEIGHTS, ...config.weights };

  const acc = new Map<Category, { applicable: number; passed: number }>();
  for (const f of findings) {
    if (!isScorable(f)) continue;
    const cat = f.check.category;
    const entry = acc.get(cat) ?? { applicable: 0, passed: 0 };
    const w = effectiveWeight(f.check);
    entry.applicable += w;
    if (f.status === 'pass') entry.passed += w;
    acc.set(cat, entry);
  }

  // Categories that have applicable checks in this run.
  const activeCategories = (Object.keys(weights) as Category[]).filter(
    (cat) => (acc.get(cat)?.applicable ?? 0) > 0,
  );
  const totalActiveWeight = activeCategories.reduce((s, cat) => s + (weights[cat] ?? 0), 0);

  const categories: CategoryScore[] = [];
  let score = 0;
  for (const cat of Object.keys(weights) as Category[]) {
    const entry = acc.get(cat);
    const applicableWeight = entry?.applicable ?? 0;
    const passedWeight = entry?.passed ?? 0;
    if (applicableWeight === 0 || totalActiveWeight === 0) {
      categories.push({ category: cat, ratio: null, weight: 0, applicableWeight, passedWeight });
      continue;
    }
    // Normalize so that active categories always sum to 100 (SPEC step 2).
    const normalizedWeight = ((weights[cat] ?? 0) / totalActiveWeight) * 100;
    const ratio = passedWeight / applicableWeight;
    score += ratio * normalizedWeight;
    categories.push({
      category: cat,
      ratio,
      weight: normalizedWeight,
      applicableWeight,
      passedWeight,
    });
  }

  const rounded = Math.round(score);

  // Blocker cap: a failed blocking check forces grade F (SPEC step 4).
  const blocker = findings.find((f) => f.check.blocking && f.status === 'error');
  const grade = blocker ? 'F' : gradeFromScore(rounded);

  return {
    score: rounded,
    grade,
    ...(blocker ? { cappedByBlocker: blocker.check.id } : {}),
    categories,
  };
}

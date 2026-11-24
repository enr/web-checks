// Agent-oriented Markdown formatter (--format agent): a projection of RunResult
// meant to be pasted into an AI-agent prompt. Only errors and warnings are
// listed; each finding states what the check actually verified (check title,
// category, tier, modes), what was observed (message + evidence) and the fix.
// Never colored, deterministic ordering inherited from RunResult.

import type { Finding } from '../core/check.js';
import { type RunResult, describePack } from './result.js';

const TIER_DESCRIPTIONS: Record<number, string> = {
  0: 'tier 0: static analysis of files/HTML/manifest, no browser',
  1: 'tier 1: runtime verification in a real browser (Playwright)',
  2: 'tier 2: Lighthouse audit',
};

export function formatAgent(result: RunResult): string {
  const lines: string[] = [];

  lines.push('# web-checks report');
  lines.push('');
  for (const t of result.targets) {
    lines.push(`- Target: \`${t.target}\` (mode: ${t.mode})`);
  }
  if (result.advisoryReason === 'no-scored-checks') {
    lines.push('- Grade: none — the selected checks have no scored outcome');
  } else if (result.advisory) {
    lines.push('- Grade: none — source-only run, advisory pre-flight (not scored)');
  } else {
    const { grade, score, cappedByBlocker } = result.score;
    const cap = cappedByBlocker ? ` — capped to F by blocking check ${cappedByBlocker}` : '';
    lines.push(`- Grade: ${grade} (${score}%)${cap}`);
  }
  if (!result.advisory) {
    lines.push('- Packs:');
    for (const p of result.packs) lines.push(`  - ${p.pack}: ${describePack(p)}`);
  }
  if (result.gate) {
    lines.push(
      `- CI gate: ${result.gate.passed ? 'passed' : 'failed'} (fail below grade ${result.gate.failBelowGrade})`,
    );
  }
  const { passed, warnings, errors, skipped } = result.counts;
  lines.push(
    `- Outcomes: ${errors} errors, ${warnings} warnings` +
      ` (${passed} passed and ${skipped} skipped omitted from this report)`,
  );
  lines.push('');

  const errorFindings = result.findings.filter((f) => f.status === 'error');
  const warningFindings = result.findings.filter((f) => f.status === 'warning');

  if (errorFindings.length === 0 && warningFindings.length === 0) {
    lines.push('No errors or warnings found.');
    lines.push('');
    return lines.join('\n');
  }

  if (errorFindings.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const f of errorFindings) lines.push(...formatFinding(f));
  }
  if (warningFindings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const f of warningFindings) lines.push(...formatFinding(f));
  }

  return lines.join('\n');
}

function formatFinding(f: Finding): string[] {
  const { check } = f;
  const lines: string[] = [];
  lines.push(`### ${check.id} — ${check.title}`);
  lines.push('');
  const blocking = check.blocking ? ' (blocking: a failure caps the grade to F)' : '';
  lines.push(`- Category: ${check.category}${blocking}`);
  const confidence = check.deterministic
    ? 'deterministic result'
    : 'heuristic result, may vary between runs';
  lines.push(`- Verified: ${check.title} (${TIER_DESCRIPTIONS[check.tier]}; ${confidence})`);
  lines.push(`- Found: ${f.message}`);
  if (f.evidence) lines.push(`- Evidence: ${f.evidence}`);
  if (f.fix) lines.push(`- Fix: ${f.fix}`);
  lines.push('');
  return lines;
}

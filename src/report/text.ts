// Colored CLI formatter (SPEC §Output — Primario). Colors are disabled when
// stdout is not a TTY, when NO_COLOR is set, or via --no-color.

import pc from 'picocolors';
import { CATEGORY_ORDER, type Category, type Finding } from '../core/check.js';
import { type RunResult, describePack } from './result.js';

export interface TextOptions {
  /** Force-disable color regardless of TTY/NO_COLOR (from --no-color). */
  noColor?: boolean;
  isTty?: boolean;
}

const CATEGORY_LABELS: Record<Category, string> = {
  Preflight: 'PREFLIGHT (source, advisory)',
  Manifest: 'MANIFEST',
  Icons: 'ICONS',
  Html: 'HTML HEAD',
  ServiceWorker: 'SERVICE WORKER',
  Offline: 'OFFLINE & CACHING',
  Installability: 'INSTALLABILITY',
  Responsiveness: 'RESPONSIVENESS',
  RuntimeHealth: 'RUNTIME HEALTH',
  UX: 'UX',
  Performance: 'PERFORMANCE',
  ModernApis: 'MODERN APIS',
  Compatibility: 'COMPATIBILITY',
  Lighthouse: 'LIGHTHOUSE',
};

const SYMBOLS = {
  pass: '✓',
  warning: '⚠',
  error: '✗',
  info: 'i',
  skipped: '·',
} as const;

function colorEnabled(opts: TextOptions): boolean {
  if (opts.noColor) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  return opts.isTty ?? process.stdout.isTTY ?? false;
}

export function formatText(result: RunResult, opts: TextOptions = {}): string {
  const c = pc.createColors(colorEnabled(opts));
  const lines: string[] = [];

  const targetDesc = result.targets.map((t) => `${t.mode}: ${t.target}`).join('  ·  ');
  lines.push(`WEB CHECKS  ·  ${targetDesc}`);
  lines.push('');

  if (result.advisoryReason === 'no-scored-checks') {
    lines.push(c.bold('NO GRADE — the selected checks have no scored outcome'));
  } else if (result.advisory) {
    lines.push(c.bold('PRE-FLIGHT (source mode) — advisory only, not scored'));
    lines.push(c.dim('  Re-run on a build/ output or a live URL for a valid grade.'));
  } else {
    const { score, grade } = result.score;
    lines.push(c.bold(`GRADE: ${grade} (${score}%)`));
    if (result.score.cappedByBlocker) {
      lines.push(c.red(`  capped to F by blocking check ${result.score.cappedByBlocker}`));
    }
  }
  if (result.gate) {
    lines.push(
      result.gate.passed
        ? c.green(`CI GATE: passed (fail below grade ${result.gate.failBelowGrade})`)
        : c.red(`CI GATE: failed (fail below grade ${result.gate.failBelowGrade})`),
    );
  }
  lines.push('');

  if (!result.advisory || result.advisoryReason === 'no-scored-checks') {
    lines.push('PACKS');
    const w = Math.max(...result.packs.map((p) => p.pack.length));
    for (const p of result.packs) {
      const line = `  ${p.pack.padEnd(w)}  ${describePack(p)}`;
      lines.push(p.active ? line : c.dim(line));
    }
    lines.push('');
  }

  const { passed, warnings, errors, skipped } = result.counts;
  const n = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
  lines.push(
    `  ${passed} passed   ·   ${n(warnings, 'warning')}   ·   ${n(errors, 'error')}   ·   ${skipped} skipped`,
  );
  lines.push('');

  const byCategory = new Map<Category, Finding[]>();
  for (const f of result.findings) {
    if (f.status === 'skipped') continue;
    const list = byCategory.get(f.check.category) ?? [];
    list.push(f);
    byCategory.set(f.check.category, list);
  }

  for (const cat of CATEGORY_ORDER) {
    const list = byCategory.get(cat);
    if (!list || list.length === 0) continue;
    lines.push(CATEGORY_LABELS[cat]);
    for (const f of list) {
      lines.push(formatFinding(f, c));
    }
    lines.push('');
  }

  const skippedFindings = result.findings.filter((f) => f.status === 'skipped');
  if (skippedFindings.length > 0) {
    lines.push('SKIPPED');
    for (const f of skippedFindings) {
      const reason = f.skipReason ? ` (${f.skipReason})` : '';
      lines.push(`  ${c.dim(`- ${f.check.id}  ${f.message}${reason}`)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatFinding(f: Finding, c: ReturnType<typeof pc.createColors>): string {
  const sym = SYMBOLS[f.status as keyof typeof SYMBOLS] ?? '·';
  const colorize =
    f.status === 'error'
      ? c.red
      : f.status === 'warning'
        ? c.yellow
        : f.status === 'pass'
          ? c.green
          : c.dim;
  const tag = f.status === 'error' || f.status === 'warning' ? `   [${f.status}]` : '';
  let out = `  ${colorize(sym)} ${f.check.id}  ${f.message}${tag}`;
  if (f.fix && (f.status === 'error' || f.status === 'warning')) {
    out += `\n            ${c.dim(`→ ${f.fix}`)}`;
  }
  return out;
}

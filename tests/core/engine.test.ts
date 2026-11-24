import { describe, expect, test } from 'vitest';
import type { Check, Finding } from '../../src/core/check.js';
import {
  DEFAULT_LAYOUT,
  DEFAULT_RUNTIME,
  DEFAULT_TIMEOUTS,
  type ResolvedConfig,
} from '../../src/core/config.js';
import { aggregateWorstOf, fuseModes, runMode, toposort } from '../../src/core/engine.js';
import { ConsoleLogger, SecretRegistry } from '../../src/core/logger.js';
import type { CheckModule } from '../../src/core/module.js';
import type { InputSource } from '../../src/loaders/input.js';

function mkCheck(id: string, over: Partial<Check> = {}): Check {
  return {
    id,
    category: 'Manifest',
    title: id,
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
    ...over,
  };
}

function mkFinding(id: string, status: Finding['status'], evidence?: string): Finding {
  return { check: mkCheck(id), status, message: id, evidence };
}

const config: ResolvedConfig = {
  targets: [{ mode: 'build', target: './x' }],
  breakpoints: [],
  layout: DEFAULT_LAYOUT,
  runtime: DEFAULT_RUNTIME,
  perf: { initialBudgetKb: 300 },
  timeouts: DEFAULT_TIMEOUTS,
  weights: {},
  ignore: [],
  routes: ['/'],
  lighthouse: false,
  ci: false,
};

const fakeInput: InputSource = {
  mode: 'build',
  baseUrl: '/x',
  read: async () => null,
  exists: async () => false,
  entryHtml: async () => null,
  list: async () => [],
};

function deps(over: Partial<ResolvedConfig> = {}) {
  return {
    input: fakeInput,
    config: { ...config, ...over },
    log: new ConsoleLogger(new SecretRegistry(), 'error'),
  };
}

describe('toposort', () => {
  test('orders dependencies before dependents', () => {
    const a: CheckModule = {
      check: mkCheck('A'),
      dependsOn: ['B'],
      run: async () => mkFinding('A', 'pass'),
    };
    const b: CheckModule = { check: mkCheck('B'), run: async () => mkFinding('B', 'pass') };
    const order = toposort([a, b]).map((m) => m.check.id);
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
  });

  test('tolerates cycles without throwing', () => {
    const a: CheckModule = {
      check: mkCheck('A'),
      dependsOn: ['B'],
      run: async () => mkFinding('A', 'pass'),
    };
    const b: CheckModule = {
      check: mkCheck('B'),
      dependsOn: ['A'],
      run: async () => mkFinding('B', 'pass'),
    };
    expect(() => toposort([a, b])).not.toThrow();
    expect(toposort([a, b])).toHaveLength(2);
  });
});

describe('aggregateWorstOf', () => {
  test('all pass -> pass', () => {
    expect(aggregateWorstOf([mkFinding('X', 'pass'), mkFinding('X', 'pass')]).status).toBe('pass');
  });
  test('one failing instance -> fails, collects evidence', () => {
    const agg = aggregateWorstOf([
      mkFinding('X', 'pass'),
      mkFinding('X', 'error', 'mobile-s @ /a'),
      mkFinding('X', 'error', 'tablet @ /b'),
    ]);
    expect(agg.status).toBe('error');
    expect(agg.evidence).toContain('mobile-s @ /a');
    expect(agg.evidence).toContain('tablet @ /b');
  });
});

describe('runMode skip-not-fail', () => {
  test('skips checks not applicable to the mode', async () => {
    const liveOnly: CheckModule = {
      check: mkCheck('L1', { modes: ['live'] }),
      run: async () => mkFinding('L1', 'pass'),
    };
    const [f] = await runMode([liveOnly], deps());
    expect(f?.status).toBe('skipped');
    expect(f?.skipReason).toBe('mode');
  });

  test('skips Tier 1 checks when no browser', async () => {
    const tier1: CheckModule = {
      check: mkCheck('T1', { tier: 1, modes: ['build'] }),
      run: async () => mkFinding('T1', 'pass'),
    };
    const [f] = await runMode([tier1], deps());
    expect(f?.skipReason).toBe('no-browser');
  });

  test('disabled via ignore -> skipped(disabled)', async () => {
    const m: CheckModule = {
      check: mkCheck('D1', { modes: ['build'] }),
      run: async () => mkFinding('D1', 'pass'),
    };
    const [f] = await runMode([m], deps({ ignore: ['D1'] }));
    expect(f?.skipReason).toBe('disabled');
  });

  test('a throwing check becomes an internal-error finding, run continues', async () => {
    const boom: CheckModule = {
      check: mkCheck('E1', { modes: ['build'] }),
      run: async () => {
        throw new Error('boom');
      },
    };
    const ok: CheckModule = {
      check: mkCheck('E2', { modes: ['build'] }),
      run: async () => mkFinding('E2', 'pass'),
    };
    const findings = await runMode([boom, ok], deps());
    expect(findings.find((f) => f.check.id === 'E1')?.status).toBe('error');
    expect(findings.find((f) => f.check.id === 'E2')?.status).toBe('pass');
  });
});

describe('fuseModes', () => {
  test('real outcome beats skipped; higher mode wins', () => {
    const fused = fuseModes([
      { mode: 'build', findings: [mkFinding('MAN-01', 'skipped')] },
      { mode: 'live', findings: [mkFinding('MAN-01', 'pass')] },
    ]);
    expect(fused).toHaveLength(1);
    expect(fused[0]?.status).toBe('pass');
    expect(fused[0]?.evidence).toContain('mode: live');
  });
});

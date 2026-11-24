// Live runs for the e2e tests. A live run whose checks need the browser fails
// with BrowserUnavailableError when Chromium cannot start; on a machine without
// a browser the e2e tests skip instead of failing (the CI browser job has one).

import { BrowserUnavailableError, type RunOptions, run } from '../../src/cli/run.js';
import type { RunResult } from '../../src/report/result.js';

/** run(), or null when no browser is available. */
export async function runLive(opts: RunOptions): Promise<RunResult | null> {
  try {
    return await run(opts);
  } catch (err) {
    if (err instanceof BrowserUnavailableError) return null;
    throw err;
  }
}

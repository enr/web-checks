import { fail, pass, skip } from '../../../core/finding.js';
import type { CheckModule } from '../../../core/module.js';
import { messages } from '../../../report/messages.js';
import { isNonEmptyString } from './field.js';
import { loadManifest } from './shared.js';

function resolvePathname(url: string): string {
  try {
    const u = new URL(url, 'http://localhost/');
    let p = u.pathname;
    if (p.endsWith('/')) p += 'index.html';
    return p;
  } catch {
    return '/';
  }
}

// MAN-05: start_url present, valid, consistent with scope, and reachable.
// Reachability is mode-specific (SPEC §1): build → file/SPA fallback exists;
// live → resource resolves; source → presence + scope coherence only.
export const man05: CheckModule = {
  check: {
    id: 'MAN-05',
    category: 'Manifest',
    title: 'start_url present, valid and reachable',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    deterministic: true,
  },
  dependsOn: ['MAN-01', 'MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json } = await loadManifest(ctx);
    const msg = messages['MAN-05'] ?? {};
    const startUrl = json?.start_url;
    if (!isNonEmptyString(startUrl)) {
      return fail(this.check, msg.missing ?? '', msg.fix ?? '');
    }
    const scope = typeof json?.scope === 'string' ? json.scope : undefined;
    const resolved = resolvePathname(startUrl as string);

    if (scope) {
      const scopePath = resolvePathname(scope).replace(/index\.html$/, '');
      if (!resolved.startsWith(scopePath.replace(/\/index\.html$/, '/'))) {
        return fail(
          this.check,
          msg.scopeMismatch ?? '',
          msg.fix ?? '',
          `start_url=${startUrl as string} scope=${scope}`,
        );
      }
    }

    // source: no reachability probing.
    if (ctx.input.mode === 'source') {
      return pass(this.check, msg.ok, `start_url=${startUrl as string}`);
    }

    const reachable = (await ctx.input.exists(resolved)) || (await ctx.input.exists('/index.html'));
    if (!reachable) {
      return fail(this.check, msg.unreachable ?? '', msg.fix ?? '', resolved);
    }
    return pass(this.check, msg.ok, `start_url=${startUrl as string}`);
  },
};

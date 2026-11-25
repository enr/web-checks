// Matching of `auth.ready.url` against the page URL.
//
// An absolute glob (`https://app.example.com/**`, `**/dashboard`) is left to
// Playwright, which matches it against the whole URL. A path (`/app/index.html`,
// `/app/*`) is relative to the target: it matches a page on the same origin
// whose path matches the glob, whatever the query string and the hash, so a
// SPA that adds `#!/` or `?tab=x` after the login still counts. When the path
// glob has a `#`, the hash is compared too (`/app/index.html#!/profile`).

/** True when the ready URL is a path to resolve against the target. */
export function isPathPattern(pattern: string): boolean {
  return pattern.startsWith('/') && !pattern.startsWith('//');
}

/** Glob to RegExp: `**` any characters, `*` any except `/`, `?` one except `/`. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** Whether `url` matches the path pattern `pattern`, relative to `baseUrl`. */
export function matchesPathPattern(pattern: string, url: string, baseUrl: string): boolean {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return false;
  }
  if (page.origin !== new URL(baseUrl).origin) return false;
  const withHash = pattern.includes('#');
  const subject = withHash ? page.pathname + page.hash : page.pathname;
  return globToRegExp(pattern).test(subject);
}

/** Resolve a path (`/login`) against the target; absolute URLs are kept. */
export function resolveAgainst(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).href;
}

# web-checks

A framework-agnostic CLI that checks web applications in the browser: runtime
health (broken assets, console errors, 5xx), responsive layout, the HTML
`<head>`, and Progressive Web App best practices when the app is a PWA. It
inspects only agnostic artifacts (rendered HTML, bundled JS, the manifest, icon
files, runtime behavior) — no per-framework tooling.

> Status: **proof of concept**, no users yet; the repository name is
> provisional. The project started as `pwa-check`, a PWA validator, and is being
> widened to any application that opens in a browser (sites, SPAs,
> server-rendered pages, admin panels, PWAs): checks are grouped in packs and
> the PWA checks only run when the app is a PWA. See
> [`.memory/SPEC.md`](.memory/SPEC.md) §"Scope and packs".
>
> Implemented: check packs with a grade per pack, Tier 0 (static), Tier 1
> (Playwright: responsiveness, runtime health, live installability/offline/SW),
> pluggable authentication, config validation, JSON and agent output, the CI
> exit-code gate. Lighthouse (Tier 2) and HTML/SARIF output are on the roadmap.

web-checks is the engine of `poqa-web`
([`enr/effective-train`](https://github.com/enr/effective-train)), which
installs it with its own Node.js and Chromium and runs it with
`--format poqa`; poqa-live's `web` checks will use it the same way.

## Install

web-checks is **not published on the public npm registry**. Each GitHub
release attaches the tarball produced by `npm pack` and a `SHA256SUMS` file;
install it from there (poqa does the same, after verifying the checksum), for
example with `gh release download vX.Y.Z -R enr/web-checks`.

```sh
sha256sum -c SHA256SUMS
npm install --global ./web-checks-<version>.tgz
# Browser for the live (Tier 1) checks, with the Playwright version web-checks
# ships with. Headless runs need only the headless shell (~280 MB instead of ~680 MB).
node "$(npm root -g)/web-checks/node_modules/playwright/cli.js" install --only-shell chromium
```

`PLAYWRIGHT_BROWSERS_PATH` chooses where the browser is installed and looked
up: set it to the same directory for the install and for the runs to keep the
browser next to web-checks (as poqa does in its cache). Node.js 20 or later.

From a checkout: `pnpm install && pnpm build`, then `node dist/cli/index.js`.

## Usage

```sh
web-checks <target...> [options]
```

A target is a folder (`source`/`build`) or a URL (`live`). The mode is
auto-detected; `--mode source,build,live` forces it. Multiple targets combine
modes (one per mode) in a single run.

```sh
web-checks ./dist --mode build          # a built output folder
web-checks https://app.example.com      # a live URL
web-checks ./dist https://staging.app   # build + live combined
```

### Options

| Flag | Meaning |
| --- | --- |
| `--mode <list>` | Comma-separated modes matched to targets in order |
| `--pack <list>` | Packs to run, replacing the defaults (see [Packs](#packs)); beats `packs` in the config file |
| `--only <list>` | Check ids to run instead of packs, `*` as wildcard (`RUN-*,HTML-02`); their dependencies run but are not listed. Not combinable with `--pack` |
| `--no-browser` | Do not launch a browser: browser (Tier 1) checks are skipped instead of failing the run |
| `--format <name>` | `text` (default), `agent` — Markdown with only errors/warnings, what each check verified, evidence and fix; ready to paste into an AI-agent prompt — `json` — machine-readable, for CI and programmatic use — or `poqa` — the `poqa-findings/v1` format shared by the poqa suite (see [Output formats](#output-formats)) |
| `-o, --output <file>` | Write the report to a file instead of stdout |
| `--fail-below-grade <g>` | CI gate, opt-in: exit 2 when the overall grade is below `A`–`F`; beats `failBelowGrade` in the config file. Source-only runs have no grade and never fail it |
| `--timeout <ms>` | HTTP request timeout (default 15000); beats `timeouts.httpMs` in the config file |
| `--lighthouse` | Enable Lighthouse (Tier 2) — lands in v1.x |
| `--no-color` | Disable colored output (also honors `NO_COLOR` / non-TTY) |
| `-q, --quiet` / `-v, --verbose` | Only errors / also debug messages on stderr; the report is unaffected |
| `-h, --help`, `-V, --version` | Help / version |

The common flags behave as in the poqa tools: `-q`/`-v`/`-V`, `--no-color`,
`-o` for a file, gates named `--fail-*` that are always opt-in and exit 2.

Exit codes, the same as every poqa tool: `0` completed, `1` usage error,
`2` CI gate crossed (`--fail-below-grade`), `3` target unreachable (DNS failure, refused
connection, timeout: an HTTP error page is still checked), browser
unavailable, fatal. A live run whose checks need
the browser exits 3 when Chromium cannot start, rather than reporting every
browser check as skipped: pass `--no-browser` to run the static checks only.

```sh
web-checks ./dist --fail-below-grade B  # gate a build in CI
web-checks ./dist --format json -o report.json
web-checks https://app.example.com --pack runtime   # only the runtime health
web-checks ./dist --only 'MAN-*'                    # only the manifest checks
```

### Configuration

Zero-config by default. Optionally add `web-checks.config.{json,js,mjs}` (or pass
`--config <path>`). Unknown keys are rejected as usage errors. The file paths in it
(`auth.module`, `auth.storageState`, `auth.cache.path`) are relative to the config
file, whatever the working directory; the `--auth*` flags are relative to the
working directory. Common keys:

```jsonc
{
  "routes": ["/dashboard", "/settings"],   // pages for Tier 1 page checks
  "breakpoints": [ /* override the 6 defaults */ ],
  "layout": { "minTouchTargetPx": 44, "ignoreSelectors": [".map", ".tooltip"] },
  "runtime": { "ignoreOrigins": ["https://analytics.example.com"] },
  "perf": { "initialBudgetKb": 300 },
  "weights": { "Manifest": 20 },            // category weight overrides
  "packs": ["runtime", "responsive", "head"], // replace the default packs
  "ignore": ["UX-03"],                       // disable checks
  "failBelowGrade": "B"                      // enables the CI gate (exit 2 below B)
}
```

### Authentication (live mode)

Content behind login. Two ways to get a session, depending on whether the
login can be scripted:

**A login form on the app itself** (username/password, optionally TOTP):
provide a single JS module via `--auth ./web-checks.auth.js`. It exports one of
three forms — a declarative DSL (`{ steps: [...] }`), an imperative function
`(page, ctx) => {}`, or a ready session (`{ headers }`, `{ cookies }`,
`{ sessionStorage }`). Secrets read via `ctx.secret()` / `{{secret.X}}` are
never printed; `ctx.totp('X')` / `{{totp.X}}` give the current authenticator
code for the base32 seed in `X`. See [`examples/auth`](examples/auth) and SPEC
§Authentication.

```js
export default {
  steps: [
    { goto: '/login' },
    { fill: '#email', value: '{{env.APP_USER}}' },
    { fill: '#password', value: '{{secret.APP_PASS}}' },
    { click: 'button[type=submit]' },
  ],
  ready: { selector: '[data-testid=app-shell]' }, // always set it
};
```

**OAuth/OIDC, SAML, SSO, MFA by push or passkey** — logins on a third-party
identity provider, which block automated browsers: record the session once,
by hand, and reuse it.

```sh
web-checks auth record https://app.example.com -o .auth/app.json
#   a browser opens: log in, then press Enter in the terminal
web-checks https://app.example.com --auth-state .auth/app.json
```

`auth record` saves cookies, localStorage, IndexedDB (Firebase Auth) and
sessionStorage (MSAL), which a plain Playwright storageState misses; a
Playwright storageState file is accepted too. It needs a display: run it on
your machine. Each run first opens the app with the session: when it has
expired, the run stops (exit 3) with the command to record it again. The file
grants access to the account: keep it out of version control; in CI, store it
as a secret and write it to disk before the run. For CI without a person,
the module can also exchange a refresh token for a session (example in
[`examples/auth/refresh-token.mjs`](examples/auth/refresh-token.mjs)).

Other settings, as flags or under `auth` in the config file:

| Setting | Meaning |
| --- | --- |
| `--auth-cache <file>` / `auth.cache: { path, ttl }` | Save the session after login and reuse it (12 h by default with the flag); a cached session that no longer opens the app triggers a fresh login. `--refresh-auth` ignores it |
| `auth.ready: { url?, selector?, timeoutMs? }` | What the app shows once logged in: checks the recorded/cached session and the function form (a DSL's own `ready` wins). Without it, a visible password field or a URL ending in `/login`, `/signin`, `/logon` counts as a failed login. A `url` starting with `/` is a path glob on the target's origin, query and hash ignored unless it has a `#` (`/app/index.html`, `/app/**`); any other `url` is a Playwright glob on the whole URL |
| `auth.httpCredentials: { username, password }` | HTTP Basic/Digest credentials for a proxy in front of the app, also sent on the static requests; `{{secret.X}}` expanded |
| `auth.headers` | Static headers on every page request; `{{secret.X}}` expanded |

### Packs

The checks are grouped in packs. Each active pack gets its own grade; the
overall grade covers the active packs.

| Pack | Checks | Active |
| --- | --- | --- |
| `runtime` | assets that fail to load, console errors, 5xx responses (RUN-01, RUN-04, RUN-05) | always |
| `responsive` | layout on 6 breakpoints (RSP-*), system font, perceived performance (UX-03, UX-05) | always |
| `head` | viewport, charset, title and description (HTML-02, HTML-04, HTML-06) | always |
| `pwa` | manifest, icons, service worker, offline, installability, PWA head tags, SW/manifest runtime errors | when the target is a PWA, or with `--pack pwa` |
| `perf`, `compat`, `modern` | performance hygiene, compatibility notes, modern APIs | always, advisory: listed, never graded |

A target is a PWA when its HTML links a web app manifest or a manifest sits at a
conventional path (`/manifest.webmanifest`, `/manifest.json`); for a source
folder, a static manifest or a PWA plugin in `package.json`. On a site that is
not a PWA, the PWA checks do not run, so it is no longer graded F for lacking a
manifest. A failed blocking check (all of them are in `pwa`) caps both the
`pwa` grade and the overall grade to F.

### Checks

~86 checks across Manifest, Icons, HTML head, Service Worker, Offline,
Installability, Responsiveness, Runtime Health, UX, Performance (advisory),
Modern APIs (advisory) and Compatibility (advisory). Each declares the modes it
runs in; non-applicable checks are skipped, never failed. Category weights are
normalized over the categories that have applicable checks, within each pack
and overall. Full catalog in the SPEC.

### Output formats

The JSON output (`--format json`) carries `schemaVersion` (currently `2`),
`version`, the overall `score`, a `packs` list (activation, reason, evidence,
grade), the `gate` outcome when `--fail-below-grade` is set (`ci` before
version 2) and every finding with its `pack`.

`--format poqa` writes the `poqa-findings/v1` document defined in
[`enr/effective-train`](https://github.com/enr/effective-train)
(`docs/poqa-findings.md`), the format every poqa tool exports: one result per
check, with `check` and `fingerprint` set to the check id, the pack as
`category`, `fix` as `hint`. Outcomes map as `pass` → `pass`, `warning` →
`warn`, `error` → `fail`, `info` → `pass` (the original outcome is in
`properties.outcome`), `skipped` → `skipped`; severities as blocking →
`critical`, `error` → `high`, `warning` → `medium`, `info` → `info`. The grade
and the per-pack grades are in the document's `properties`. A copy of the
schema is kept in `tests/schemas/` for the tests: refresh it from
effective-train when the contract changes.

## Development

The scripts in `.sdlc/` are what CI runs; they use `pnpm` from `PATH`, or the
version pinned in `packageManager` through `npx`.

```sh
.sdlc/ci           # install, lint, all tests, package: the whole pipeline
.sdlc/build        # tsup -> dist/
.sdlc/lint         # biome + tsc --noEmit (+ shellcheck when installed)
.sdlc/lint-fix     # biome's fixes and formatting
.sdlc/fmt          # biome format
.sdlc/test         # unit tests; `e2e` for the browser ones, `all` for both
.sdlc/package      # out/web-checks-<version>.tgz + SHA256SUMS, smoke-tested
.sdlc/release      # release commit + tag + next snapshot, then push
```

The browser tests need Playwright's Chromium (`pnpm exec playwright install
chromium`); without it `.sdlc/test e2e` skips them, unless
`WEB_CHECKS_CI_STRICT=1`.

Architecture, contracts (`InputSource`, `CheckModule`, `BrowserDriver`, …) and
the check catalog live in the SPEC and implementation plan under `.memory/`.

### Releasing

1. From an up-to-date, clean `main`: `.sdlc/release X.Y.Z X.Y.Z+1`. It sets
   the version in `package.json` and `src/version.ts`, commits, tags `vX.Y.Z`,
   moves to `X.Y.Z+1-SNAPSHOT` and pushes branch and tag.
2. The `Release` workflow checks that the tag matches the version, runs
   `.sdlc/ci` (lint, unit tests, the tarball installed in a fresh prefix and
   run), then creates the GitHub release with the tarball and `SHA256SUMS`.

To try a build with poqa-web before releasing, `.sdlc/package` and point
`~/.config/poqa/web/tools.toml` at `out/`.

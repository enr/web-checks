// Centralized message catalog (English; single point for future i18n).
// SPEC §"Message language": message/fix texts live here, never inline in the
// ~80 checks. Populated per check during Phase 1.

export interface CheckMessages {
  [key: string]: string;
}

export const messages: Record<string, CheckMessages> = {
  'MAN-01': {
    ok: 'Manifest found',
    okConventional: 'Manifest found at a conventional path (not linked in HTML)',
    missing: 'No web app manifest found (neither linked nor at a conventional path)',
    fix: 'Add a manifest.webmanifest and link it with <link rel="manifest">',
  },
  'MAN-02': {
    ok: 'Manifest is valid JSON / UTF-8 with no duplicate keys',
    invalidUtf8: 'Manifest is not valid UTF-8',
    invalidJson: 'Manifest is not valid JSON',
    duplicateKeys: 'Manifest has duplicate keys (the last one silently wins)',
    fix: 'Fix the manifest so it is valid UTF-8 JSON without duplicate keys',
  },
  'MAN-03': {
    missing: 'Manifest "name" is missing or empty',
    fix: 'Add a "name" field to the manifest',
  },
  'MAN-04': {
    ok: 'short_name present',
    missing: 'Manifest "short_name" is missing',
    tooLong: 'short_name is longer than the recommended 12 characters',
    fix: 'Add a "short_name" of at most 12 characters',
  },
  'MAN-05': {
    ok: 'start_url is present and reachable',
    missing: 'Manifest "start_url" is missing',
    scopeMismatch: 'start_url is not within scope',
    unreachable: 'start_url does not resolve to an existing resource',
    fix: 'Add a valid "start_url" that is within "scope" and reachable',
  },
  'MAN-06': {
    ok: 'display is installable',
    missing: 'Manifest "display" is missing',
    browser: 'display is "browser" which is not installable',
    fix: 'Set "display" to standalone, fullscreen or minimal-ui',
  },
  'MAN-07': {
    ok: 'icons array is present and well-formed',
    missing: 'Manifest "icons" is missing or empty',
    malformed: 'Manifest "icons" entries are malformed (need src and sizes)',
    fix: 'Add an "icons" array with valid src, sizes and type',
  },
  'MAN-08': {
    ok: 'scope present and consistent with start_url',
    missing: 'Manifest "scope" is missing',
    mismatch: 'start_url is not within scope',
    fix: 'Add a "scope" that contains the start_url',
  },
  'MAN-09': {
    ok: 'theme_color present',
    missing: 'Manifest "theme_color" is missing',
    fix: 'Add "theme_color" to the manifest and a matching <meta name="theme-color">',
  },
  'MAN-10': {
    ok: 'background_color present',
    missing: 'Manifest "background_color" is missing',
    fix: 'Add "background_color" for a smooth splash screen',
  },
  'MAN-11': {
    ok: 'description present',
    missing: 'Manifest "description" is missing',
    fix: 'Add a "description" field',
  },
  'MAN-12': {
    ok: 'lang/dir present',
    missing: 'Manifest "lang" and/or "dir" are missing',
    fix: 'Add "lang" and "dir" for correct localization',
  },
  'MAN-13': {
    ok: 'orientation present',
    missing: 'Manifest "orientation" is missing',
    fix: 'Add an "orientation" hint if the app has a preferred orientation',
  },
  'MAN-14': {
    ok: 'categories present',
    missing: 'Manifest "categories" is missing',
    fix: 'Add "categories" to help app stores classify the app',
  },
  'MAN-15': {
    ok: 'id present',
    missing: 'Manifest "id" is missing',
    fix: 'Add an "id" to keep the app identity stable across start_url changes',
  },
  'MAN-16': {
    ok: 'screenshots present with wide and narrow form factors',
    missing: 'Manifest "screenshots" is missing — the install prompt falls back to the basic UI',
    malformed: 'Manifest "screenshots" entries are malformed (need a src; sizes must be WxH)',
    formFactor: 'Manifest screenshots do not cover both "wide" and "narrow" form factors',
    fix: 'Add "screenshots" with form_factor "wide" (desktop) and "narrow" (mobile) for the richer install UI',
  },
  'RUN-01': {
    ok: 'no failing same-origin asset requests',
    failed: 'Same-origin assets returned an error status (e.g. 404)',
    fix: 'Fix or remove the broken asset references',
  },
  'RUN-02': {
    ok: 'no 404 on manifest/precached resources',
    failed: 'Manifest-declared resources (icons / start_url) returned 404',
    fix: 'Ensure every manifest icon and start_url resolves at runtime',
  },
  'RUN-03': {
    ok: 'no console errors during SW registration / manifest fetch',
    failed: 'Console/page errors related to the Service Worker or manifest',
    fix: 'Fix the Service Worker registration / manifest errors reported in the console',
  },
  'RUN-04': {
    ok: 'no unhandled console errors on first load',
    failed: 'Unhandled console/page errors on first load',
    fix: 'Investigate and fix the runtime errors reported in the console',
  },
  'RUN-05': {
    ok: 'no 5xx responses on same-origin requests',
    failed: 'Same-origin requests returned a 5xx status',
    fix: 'Fix the failing server responses',
  },
  'RSP-01': {
    ok: 'viewport meta allows zoom and uses device-width',
    missing: 'No <meta name="viewport">',
    zoomBlocked: 'viewport disables zoom (user-scalable=no or maximum-scale=1)',
    fix: 'Use content="width=device-width, initial-scale=1" without user-scalable=no',
  },
  'RSP-02': {
    ok: 'no horizontal overflow at any breakpoint',
    overflow: 'Horizontal overflow (page scrolls sideways) at some breakpoints',
    fix: 'Remove fixed widths / add max-width:100% so content fits the viewport',
  },
  'RSP-03': {
    ok: 'touch targets are at least 44x44 on mobile',
    small: 'Touch targets smaller than 44x44 on mobile breakpoints',
    fix: 'Increase interactive element size to at least 44x44 CSS px on mobile',
  },
  'RSP-04': {
    ok: 'no text below the minimum readable size',
    small: 'Text smaller than the minimum readable size',
    fix: 'Use a base font-size of at least 12px (ideally 16px) for body text',
  },
  'RSP-05': {
    ok: 'media queries / adaptive CSS detected',
    missing: 'No @media queries found in the CSS',
    fix: 'Add responsive CSS (@media queries) to adapt the layout to screen size',
  },
  'RSP-06': {
    ok: 'no fixed-width element exceeds the viewport',
    wide: 'Fixed-width elements exceed the viewport',
    fix: 'Replace fixed px widths with relative units / max-width:100%',
  },
  'RSP-07': {
    ok: 'images and media scale with their container',
    overflow: 'Images/media exceed their container or the viewport',
    fix: 'Add max-width:100%; height:auto to media so it scales down',
  },
  'RSP-08': {
    ok: 'layout reflows to a single column on mobile',
    noReflow: 'A wide multi-column layout does not reflow and causes overflow on mobile',
    fix: 'Use responsive layout (flex-wrap / grid) so columns stack on mobile',
  },
  'RSP-09': {
    ok: 'no undue element overlap',
    overlap: 'Text/interactive elements overlap',
    fix: 'Adjust layout/spacing so elements do not overlap',
  },
  'RSP-10': {
    ok: 'no unintended text clipping',
    clipped: 'Text is clipped by overflow:hidden without an intentional ellipsis',
    fix: 'Allow text to wrap or use an explicit ellipsis/line-clamp',
  },
  'RSP-11': {
    ok: 'content reflows at 320 CSS px equivalent (WCAG 1.4.10)',
    fails: 'Content requires two-dimensional scrolling at 320 CSS px (400% zoom)',
    fix: 'Ensure content reflows to one column at 320px equivalent without horizontal scroll',
  },
  'SRC-01': {
    ok: 'manifest present as a static file',
    missing: 'No manifest file in public/, static/ or the root',
    fix: 'Add a manifest.webmanifest (typically under public/) — re-run on build for a full check',
  },
  'SRC-02': {
    ok: 'Service Worker present (static file or PWA plugin)',
    missing: 'No static SW file and no PWA plugin in package.json',
    fix: 'Add a Service Worker or a PWA plugin (vite-plugin-pwa, next-pwa, serwist, ...)',
  },
  'SRC-03': {
    ok: 'serviceWorker.register(...) found in the source',
    missing: 'No navigator.serviceWorker.register(...) call found in the source',
    fix: 'Register a Service Worker in your app code — re-run on build/live for a full check',
  },
  'PERF-01': {
    ok: 'initial JS/CSS weight is within budget',
    over: 'initial JS/CSS weight exceeds the budget',
    fix: 'Reduce the initial bundle (code-split, tree-shake) or raise perf.initialBudgetKb',
  },
  'PERF-02': {
    ok: 'no avoidable render-blocking scripts in <head>',
    blocking: 'Synchronous scripts in <head> block rendering',
    fix: 'Add defer/async or type="module", or move scripts to the end of <body>',
  },
  'PERF-03': {
    ok: 'images use lazy-loading / modern formats',
    missing: 'Some images are not lazy-loaded and not in a modern format',
    fix: 'Add loading="lazy" to below-the-fold images and use WebP/AVIF',
  },
  'PERF-04': {
    ok: 'preconnect/preload hints present',
    missing: 'No preconnect/preload hints for critical resources',
    fix: 'Add <link rel="preconnect"> / <link rel="preload"> for critical origins/assets',
  },
  'PERF-05': {
    ok: 'no source maps served in production',
    served: 'Source maps appear to be served in production',
    fix: 'Do not ship .map files (or their sourceMappingURL) to production',
  },
  'PERF-06': {
    ok: 'static assets are content-hashed',
    missing: 'Static assets are not content-hashed (no cache-busting)',
    fix: 'Emit hashed filenames (e.g. app.4f3a9b2c.js) for long-term caching',
  },
  'UX-01': {
    ok: 'theme_color is consistent between manifest and meta tag',
    mismatch: 'theme_color differs between manifest and <meta name="theme-color">',
    missing: 'theme_color not declared in both manifest and meta',
    fix: 'Use the same theme color in the manifest and the <meta name="theme-color">',
  },
  'UX-02': {
    ok: 'display is installable (no browser dead-end)',
    missing: 'display is not an installable value',
    fix: 'Use display: standalone (or fullscreen/minimal-ui) for an app-like UX',
  },
  'UX-03': {
    ok: 'system fonts are used',
    missing: 'No system font stack detected',
    fix: 'Consider font-family: system-ui for faster, native-feeling text',
  },
  'UX-04': {
    ok: 'shortcuts are declared in the manifest',
    missing: 'No shortcuts declared in the manifest',
    fix: 'Add a "shortcuts" array to expose quick actions from the app icon',
  },
  'UX-05': {
    ok: 'perceived-performance hints detected (preload / lazy-loading)',
    missing: 'No skeleton/preload/lazy-loading hints detected',
    fix: 'Add preload/lazy-loading (or a skeleton) to improve perceived performance',
  },
  'SW-08': {
    ok: 'Service Worker is registered and activated at runtime',
    missing: 'No Service Worker activated at runtime',
    fix: 'Ensure the Service Worker registers and activates when the app loads',
  },
  'SW-09': {
    ok: 'Service Worker scope covers the manifest scope',
    mismatch: 'Service Worker scope does not cover the manifest scope',
    fix: 'Serve the Service Worker from a path whose scope contains the app scope',
  },
  'INST-01': {
    ok: 'served over HTTPS (or localhost)',
    insecure: 'Not served over HTTPS',
    mixed: 'HTTPS page loads insecure (http:) resources (mixed content)',
    fix: 'Serve the app over HTTPS and load all resources over HTTPS',
  },
  'INST-03': {
    ok: 'beforeinstallprompt fired (installable at runtime)',
    missing: 'beforeinstallprompt did not fire within 5s',
    fix: 'Meet the installability criteria; note the event is Chromium-only',
  },
  'OFF-02': {
    ok: 'the app responds with useful content offline',
    failed: 'The app does not respond with useful content offline',
    fix: 'Cache the app shell in the Service Worker so navigations work offline',
  },
  'OFF-01': {
    ok: 'offline fallback detected',
    missing: 'No offline fallback (offline.html or a fallback route)',
    fix: 'Add an offline.html fallback and serve it from the fetch handler',
  },
  'OFF-03': {
    ok: 'cache is versioned',
    managed: 'cache versioning handled by Workbox/plugin (revisioned precache)',
    missing: 'Cache name has no version/hash',
    fix: 'Include a version or hash in the cache name (e.g. "app-v2")',
  },
  'OFF-04': {
    ok: 'old caches are cleaned up on activate',
    managed: 'cache cleanup handled by Workbox/plugin',
    missing: 'No cleanup of stale caches in the activate handler',
    fix: 'In activate, delete caches whose name differs from the current one',
  },
  'OFF-05': {
    ok: 'skipWaiting is present',
    managed: 'skipWaiting handled by Workbox/plugin',
    missing: 'skipWaiting() is not called',
    fix: 'Call self.skipWaiting() so updates activate promptly',
  },
  'OFF-06': {
    ok: 'clients.claim() is present',
    managed: 'clients.claim handled by Workbox/plugin',
    missing: 'clients.claim() is not called',
    fix: 'Call self.clients.claim() so the SW controls open pages immediately',
  },
  'INST-02': {
    ok: 'installability criteria are met (manifest + SW + icons + display)',
    missing: 'Installability criteria are not met',
    fix: 'Ensure a valid manifest, a Service Worker, 192/512 icons and an installable display',
  },
  'SW-01': {
    ok: 'Service Worker file found',
    missing: 'No Service Worker file found',
    fix: 'Add a Service Worker (sw.js) and register it',
  },
  'SW-02': {
    ok: 'Service Worker registration found in the bundle',
    missing: 'No navigator.serviceWorker.register(...) call found',
    fix: 'Call navigator.serviceWorker.register("/sw.js") in your app bundle',
  },
  'SW-03': {
    ok: 'install event handled',
    managed: 'install handled by Workbox/plugin (by construction)',
    missing: 'No "install" event handler',
    fix: 'Add self.addEventListener("install", ...) to pre-cache the app shell',
  },
  'SW-04': {
    ok: 'fetch event handled',
    managed: 'fetch handled by Workbox/plugin (by construction)',
    missing: 'No "fetch" event handler (required for offline)',
    fix: 'Add self.addEventListener("fetch", ...) to serve cached responses',
  },
  'SW-05': {
    ok: 'activate event handled',
    managed: 'activate handled by Workbox/plugin (by construction)',
    missing: 'No "activate" event handler',
    fix: 'Add self.addEventListener("activate", ...) to clean up old caches',
  },
  'SW-06': {
    ok: 'Cache API is used',
    managed: 'caching handled by Workbox/plugin (by construction)',
    missing: 'No Cache API usage detected',
    fix: 'Use caches.open()/cache.addAll() or a precache to store assets',
  },
  'SW-07': {
    ok: 'offline strategy detected',
    missing: 'No offline caching strategy detected',
    fix: 'Implement a caching strategy (Cache First / Network First / SWR)',
  },
  'ICO-01': {
    ok: '192x192 icon present and file exists',
    notDeclared: 'No 192x192 icon declared in the manifest',
    onlyMaskable: '192x192 icon is declared only as maskable (needs purpose "any")',
    fileMissing: '192x192 icon is declared but the file does not exist',
    fix: 'Add a 192x192 PNG icon with purpose "any" and ship the file',
  },
  'ICO-02': {
    ok: '512x512 icon present and file exists',
    notDeclared: 'No 512x512 icon declared in the manifest',
    onlyMaskable: '512x512 icon is declared only as maskable (needs purpose "any")',
    fileMissing: '512x512 icon is declared but the file does not exist',
    fix: 'Add a 512x512 PNG icon with purpose "any" and ship the file',
  },
  'ICO-03': {
    ok: 'icons are PNG with the correct MIME type',
    notPng: 'One or more icons are not PNG / have an incorrect MIME type',
    fix: 'Serve icons as PNG with type "image/png"',
  },
  'ICO-04': {
    ok: 'a maskable icon is present',
    missing: 'No icon with purpose "maskable"',
    fix: 'Add an icon with "purpose": "maskable" for adaptive icon platforms',
  },
  'ICO-05': {
    ok: 'additional recommended icon sizes are present',
    missing: 'No additional recommended sizes (48/72/96/128/256)',
    fix: 'Add extra icon sizes (48, 72, 96, 128, 256) for better platform coverage',
  },
  'ICO-06': {
    ok: 'apple-touch-icon is a valid PNG of at least 180x180',
    fileMissing: 'apple-touch-icon file does not exist',
    notPng: 'apple-touch-icon is not a PNG',
    tooSmall: 'apple-touch-icon is smaller than 180x180',
    fix: 'Provide a 180x180 (or larger) PNG apple-touch-icon',
  },
  'ICO-07': {
    ok: 'declared icon sizes match the real pixel dimensions',
    mismatch: 'Declared icon sizes do not match the real pixel dimensions',
    fix: 'Fix the "sizes" attribute to match the actual image dimensions',
  },
  'HTML-01': {
    ok: 'manifest link found',
    missing: 'No <link rel="manifest"> in the HTML head',
    missingButFile: 'Manifest file exists but is not linked from the HTML head',
    fix: 'Add <link rel="manifest" href="/manifest.webmanifest"> to the <head>',
  },
  'HTML-02': {
    ok: 'viewport meta is present with width=device-width',
    missing: 'No <meta name="viewport">',
    noDeviceWidth: 'viewport meta is missing width=device-width',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
  },
  'HTML-03': {
    ok: 'theme-color meta is present',
    missing: 'No <meta name="theme-color">',
    fix: 'Add <meta name="theme-color" content="#0b5"> matching the manifest',
  },
  'HTML-04': {
    ok: 'charset is UTF-8',
    missing: 'No <meta charset="utf-8">',
    fix: 'Add <meta charset="utf-8"> as the first tag in <head>',
  },
  'HTML-05': {
    ok: 'apple-touch-icon link is present',
    missing: 'No <link rel="apple-touch-icon">',
    fix: 'Add <link rel="apple-touch-icon" href="/apple-touch-icon.png"> (180x180)',
  },
  'HTML-06': {
    ok: 'title and description are present',
    missing: 'Missing <title> and/or <meta name="description">',
    fix: 'Add a <title> and a <meta name="description"> for SEO and app metadata',
  },
  'HTML-07': {
    ok: 'web-app-capable meta is present',
    missing: 'No apple-mobile-web-app-capable / mobile-web-app-capable meta',
    fix: 'Add <meta name="mobile-web-app-capable" content="yes">',
  },
  'HTML-08': {
    ok: 'iOS splash screen links are present',
    missing: 'No <link rel="apple-touch-startup-image"> — iOS shows a blank flash on launch',
    fix: 'Add <link rel="apple-touch-startup-image"> entries with media queries per device/orientation',
  },
};

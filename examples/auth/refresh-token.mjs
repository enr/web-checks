// OAuth/OIDC in CI, without a person and without the provider's login pages:
// exchange the refresh token of a test user for an access token, then hand it
// to the app the way the app keeps it. Works with any OIDC provider that issues
// refresh tokens (Entra ID, Auth0, Okta, Keycloak, Cognito, ...).
//
// OIDC_TOKEN_URL     the provider's token endpoint
// OIDC_CLIENT_ID     the app's client id (public client: no secret)
// OIDC_REFRESH_TOKEN a refresh token of the test user (offline_access scope)
//
//   web-checks https://app.example.com --auth examples/auth/refresh-token.mjs
//
// Adapt the return value to where the app reads its session (see below).
export default async function auth(_page, ctx) {
  const res = await fetch(ctx.env('OIDC_TOKEN_URL'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ctx.env('OIDC_CLIENT_ID'),
      refresh_token: ctx.secret('OIDC_REFRESH_TOKEN'),
    }),
  });
  if (!res.ok) throw new Error(`token endpoint answered ${res.status}`);
  const { access_token: token } = await res.json();
  process.env.OIDC_ACCESS_TOKEN = token;
  ctx.secret('OIDC_ACCESS_TOKEN'); // redact it from report and logs

  // 1. The app sends the token as a header (APIs behind the SPA):
  return { headers: { Authorization: `Bearer ${token}` } };

  // 2. The app reads it from sessionStorage (e.g. a custom key):
  // return { sessionStorage: [{ origin: ctx.baseUrl, entries: [{ name: 'access_token', value: token }] }] };

  // 3. The app has its own session cookie, issued by a backend endpoint:
  // const r = await fetch(ctx.resolve('/api/session'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  // const sid = /sid=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
  // return { cookies: [{ name: 'sid', value: sid, httpOnly: true }] };
}

# Authentication examples

Which one to use:

| The login is… | Use |
| --- | --- |
| a form on the app (user/password, optionally TOTP) | an auth module: [`form-totp.mjs`](form-totp.mjs) |
| on an identity provider (Google, Microsoft, GitHub, Okta, SAML), with push/passkey MFA | `web-checks auth record`, then `--auth-state` |
| OAuth/OIDC in CI, with no person to log in | a refresh token exchanged by the module: [`refresh-token.mjs`](refresh-token.mjs) |
| HTTP Basic auth on a staging proxy | `auth.httpCredentials` in the config: [`web-checks.config.json`](web-checks.config.json) |

Recorded session, the usual flow for OAuth:

```sh
web-checks auth record https://app.example.com -o .auth/app.json
web-checks https://app.example.com --auth-state .auth/app.json
```

`.auth/` holds live credentials: it is in `.gitignore`. When the run says
`auth failed / expired`, record the session again.

[`web-checks.config.json`](web-checks.config.json) combines a recorded session,
the check that it still opens the app (`ready`), and Basic credentials for a
staging proxy; drop what does not apply.

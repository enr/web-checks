// Login form on the app itself, with an authenticator (TOTP) second step.
// APP_USER / APP_PASS: the test account. APP_TOTP_SEED: the base32 secret
// behind the account's authenticator QR code (otpauth://...?secret=...).
//   web-checks https://app.example.com --auth examples/auth/form-totp.mjs
export default {
  steps: [
    { goto: '/login' },
    { fill: 'input[name="email"]', value: '{{env.APP_USER}}' },
    { fill: 'input[name="password"]', value: '{{secret.APP_PASS}}' },
    { click: 'button[type="submit"]' },
    { waitFor: { selector: 'input[autocomplete="one-time-code"]' } },
    { fill: 'input[autocomplete="one-time-code"]', value: '{{totp.APP_TOTP_SEED}}' },
    { click: 'button[type="submit"]' },
  ],
  // What only a logged-in user sees: without it, the run cannot tell a failed
  // login from the app.
  ready: { selector: '[data-testid="app-shell"]', timeoutMs: 15000 },
};

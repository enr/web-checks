import { afterEach, describe, expect, test } from 'vitest';
import { missingEnvVars } from '../../src/auth/dsl.js';
import type { AuthDSL } from '../../src/auth/types.js';

const dsl: AuthDSL = {
  steps: [
    { setCookie: { name: 'consent', value: '{{env.PWA_TEST_CONSENT}}' } },
    { goto: '/login' },
    { fill: 'input[name="username"]', value: '{{env.PWA_TEST_USER}}' },
    { fill: 'input[name="password"]', value: '{{secret.PWA_TEST_PASS}}' },
    { setLocalStorage: { key: 'token', value: '{{secret.PWA_TEST_TOKEN}}' } },
    { click: 'button[type="submit"]' },
  ],
};

afterEach(() => {
  for (const name of ['PWA_TEST_CONSENT', 'PWA_TEST_USER', 'PWA_TEST_PASS', 'PWA_TEST_TOKEN']) {
    delete process.env[name];
  }
});

describe('missingEnvVars', () => {
  test('lists env/secret placeholders whose variable is not set', () => {
    process.env.PWA_TEST_CONSENT = '1';
    process.env.PWA_TEST_USER = 'alice';
    expect(missingEnvVars(dsl)).toEqual(['PWA_TEST_PASS', 'PWA_TEST_TOKEN']);
  });

  test('empty string counts as set', () => {
    process.env.PWA_TEST_CONSENT = '';
    process.env.PWA_TEST_USER = '';
    process.env.PWA_TEST_PASS = '';
    process.env.PWA_TEST_TOKEN = '';
    expect(missingEnvVars(dsl)).toEqual([]);
  });

  test('no placeholders -> nothing missing', () => {
    expect(missingEnvVars({ steps: [{ goto: '/login' }, { click: 'button' }] })).toEqual([]);
  });
});

describe('missingEnvVars (totp, sessionStorage)', () => {
  test('covers {{totp.X}} and setSessionStorage values', () => {
    expect(
      missingEnvVars({
        steps: [
          { fill: '#otp', value: '{{totp.PWA_TEST_OTP_SEED}}' },
          { setSessionStorage: { key: 'k', value: '{{secret.PWA_TEST_SS}}' } },
        ],
      }),
    ).toEqual(['PWA_TEST_OTP_SEED', 'PWA_TEST_SS']);
  });
});

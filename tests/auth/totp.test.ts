import { describe, expect, test } from 'vitest';
import { createAuthContext, expandPlaceholders } from '../../src/auth/context.js';
import { base32Decode, totp } from '../../src/auth/totp.js';
import { ConsoleLogger, SecretRegistry } from '../../src/core/logger.js';

// RFC 6238 Appendix B: the SHA-1 seed is the ASCII "12345678901234567890".
const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp (RFC 6238)', () => {
  test('base32 decodes the RFC seed', () => {
    expect(base32Decode(SEED).toString('ascii')).toBe('12345678901234567890');
    expect(base32Decode('gezd gnbv-gy3t qojq====').toString('ascii')).toBe('1234567890');
  });

  test.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [20000000000, '65353130'],
  ])('T=%i -> %s (8 digits)', (t, code) => {
    expect(totp(SEED, { now: t * 1000, digits: 8 })).toBe(code);
  });

  test('defaults to 6 digits', () => {
    expect(totp(SEED, { now: 59_000 })).toBe('287082');
  });

  test('rejects a secret that is not base32', () => {
    expect(() => totp('not base32!')).toThrow(/base32/);
    expect(() => totp('')).toThrow(/empty/);
  });

  test('{{totp.X}} and ctx.totp() redact the seed and the code', () => {
    process.env.WC_TEST_TOTP = SEED;
    try {
      const secrets = new SecretRegistry();
      const code = expandPlaceholders('{{totp.WC_TEST_TOTP}}', secrets);
      expect(code).toMatch(/^\d{6}$/);
      expect(secrets.redact(`seed ${SEED} code ${code}`)).not.toContain(SEED);
      expect(secrets.redact(`code ${code}`)).not.toContain(code);
      const ctx = createAuthContext('http://x', secrets, new ConsoleLogger(secrets, 'error'));
      expect(ctx.totp('WC_TEST_TOTP')).toMatch(/^\d{6}$/);
    } finally {
      Reflect.deleteProperty(process.env, 'WC_TEST_TOTP');
    }
  });
});

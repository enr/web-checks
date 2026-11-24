import { describe, expect, test } from 'vitest';
import { expandPlaceholders } from '../../src/auth/context.js';
import { detectForm } from '../../src/auth/loader.js';
import { SecretRegistry } from '../../src/core/logger.js';

describe('detectForm', () => {
  test('function -> fn', () => {
    expect(detectForm(async () => {}).kind).toBe('fn');
  });
  test('object with steps -> dsl', () => {
    expect(detectForm({ steps: [{ goto: '/login' }] }).kind).toBe('dsl');
  });
  test('object with headers -> session', () => {
    expect(detectForm({ headers: { Authorization: 'Bearer x' } }).kind).toBe('session');
  });
});

describe('expandPlaceholders + secret redaction', () => {
  test('expands env and secret placeholders and registers secrets', () => {
    process.env.PWA_TEST_USER = 'alice';
    process.env.PWA_TEST_PASS = 's3cr3t';
    const secrets = new SecretRegistry();
    const filled = expandPlaceholders('{{env.PWA_TEST_USER}}:{{secret.PWA_TEST_PASS}}', secrets);
    expect(filled).toBe('alice:s3cr3t');
    // The secret value is redacted everywhere, the env value is not.
    expect(secrets.redact('login as alice with s3cr3t')).toBe('login as alice with «redacted»');
  });
});

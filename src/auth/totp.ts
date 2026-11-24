// TOTP (RFC 6238, the codes of authenticator apps) with node:crypto only: auth
// modules cannot import npm packages, so the MFA code is computed here.

import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode an RFC 4648 base32 secret; spaces, dashes and padding are ignored. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('TOTP secret is not valid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export interface TotpOptions {
  /** Unix time in ms (default: now). */
  now?: number;
  period?: number;
  digits?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
}

/**
 * The TOTP code for a base32 secret (the value behind an authenticator QR
 * code, `otpauth://...?secret=...`). Defaults: SHA-1, 6 digits, 30 s.
 */
export function totp(secret: string, opts: TotpOptions = {}): string {
  const key = base32Decode(secret);
  if (key.length === 0) throw new Error('TOTP secret is empty');
  return hotp(key, Math.floor((opts.now ?? Date.now()) / 1000 / (opts.period ?? 30)), opts);
}

function hotp(key: Buffer, counter: number, opts: TotpOptions): string {
  const digits = opts.digits ?? 6;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(opts.algorithm ?? 'sha1', key)
    .update(msg)
    .digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

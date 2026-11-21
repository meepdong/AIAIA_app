import { ed25519 } from '@noble/curves/ed25519';
import { base64UrlDecode, parsePassQr, passMessage, PUBLIC_KEY_BYTES } from './format';

export type VerifyResult =
  | { ok: true; memberId: string; passVersion: number }
  | { ok: false; reason: 'no_key' | 'malformed' | 'bad_signature' | 'stale' };

/** The app's pass public key (app.config.ts extra.passPublicKey, base64url) as bytes. */
export function decodePublicKey(key: string | null | undefined): Uint8Array | null {
  const bytes = key ? base64UrlDecode(key) : null;
  return bytes && bytes.length === PUBLIC_KEY_BYTES ? bytes : null;
}

/**
 * Checks a scanned pass offline: format, then the Ed25519 signature (RFC 8032, strict, not
 * ZIP-215), then, when the caller passes the member's current version from the event pack,
 * that the pass has not been reissued since. Fails closed without a public key.
 */
export function verifyPass(
  qrText: string,
  publicKey: string | null | undefined,
  currentPassVersion?: number,
): VerifyResult {
  const key = decodePublicKey(publicKey);
  if (!key) return { ok: false, reason: 'no_key' };
  const pass = parsePassQr(qrText);
  if (!pass) return { ok: false, reason: 'malformed' };
  let valid = false;
  try {
    valid = ed25519.verify(pass.signature, passMessage(pass.memberId, pass.passVersion), key, {
      zip215: false,
    });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };
  if (currentPassVersion !== undefined && pass.passVersion !== currentPassVersion) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, memberId: pass.memberId, passVersion: pass.passVersion };
}

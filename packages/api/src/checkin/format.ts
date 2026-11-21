// Delegate pass format, shared by the app (verify) and, through a test cross-check, the
// member-pass Edge Function (sign). No imports, so Deno tests can load this file directly.
//
//   signed message:  v1|<member_id>|<pass_version>      (member_id: lowercase hyphenated uuid)
//   QR text:         AIAIA1.<b64url(member_id 16 bytes)>.<pass_version>.<b64url(signature 64 bytes)>
//
// Parsing is strict and canonical: one text per (member, version, signature), so an altered
// encoding cannot carry a valid signature.

export const PASS_QR_PREFIX = 'AIAIA1';
export const SIGNATURE_BYTES = 64;
export const PUBLIC_KEY_BYTES = 32;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION_RE = /^[1-9][0-9]{0,8}$/;

export type ParsedPass = { memberId: string; passVersion: number; signature: Uint8Array };

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      ALPHABET.charAt((n >> 18) & 63) +
      ALPHABET.charAt((n >> 12) & 63) +
      ALPHABET.charAt((n >> 6) & 63) +
      ALPHABET.charAt(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63);
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out +=
      ALPHABET.charAt((n >> 18) & 63) +
      ALPHABET.charAt((n >> 12) & 63) +
      ALPHABET.charAt((n >> 6) & 63);
  }
  return out;
}

/** Unpadded base64url to bytes; null for any character, length or non-canonical tail it rejects. */
export function base64UrlDecode(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  const decoded = out.subarray(0, o);
  // Leftover bits must be zero, so every byte string has exactly one encoding.
  return base64UrlEncode(decoded) === text ? decoded : null;
}

export function uuidToBytes(uuid: string): Uint8Array | null {
  if (!UUID_RE.test(uuid)) return null;
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToUuid(bytes: Uint8Array): string | null {
  if (bytes.length !== 16) return null;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The exact bytes that are signed. */
export function passMessage(memberId: string, passVersion: number): Uint8Array {
  // ASCII only (uuid, digits, separators), so char codes are the UTF-8 bytes.
  return Uint8Array.from(`v1|${memberId}|${passVersion}`, (c) => c.charCodeAt(0));
}

export function encodePassQr(memberId: string, passVersion: number, signature: Uint8Array): string {
  const id = uuidToBytes(memberId);
  if (!id) throw new Error('member id must be a lowercase uuid');
  if (!Number.isInteger(passVersion) || passVersion < 1) throw new Error('bad pass_version');
  if (signature.length !== SIGNATURE_BYTES) throw new Error('bad signature length');
  return `${PASS_QR_PREFIX}.${base64UrlEncode(id)}.${passVersion}.${base64UrlEncode(signature)}`;
}

/** Splits a scanned QR text. Says nothing about authenticity: call verifyPass for that. */
export function parsePassQr(text: string): ParsedPass | null {
  if (typeof text !== 'string' || text.length > 200) return null;
  const parts = text.split('.') as [string, string, string, string];
  if (parts.length !== 4 || parts[0] !== PASS_QR_PREFIX) return null;
  const idBytes = base64UrlDecode(parts[1]);
  const memberId = idBytes ? bytesToUuid(idBytes) : null;
  if (!memberId || !VERSION_RE.test(parts[2])) return null;
  const signature = base64UrlDecode(parts[3]);
  if (!signature || signature.length !== SIGNATURE_BYTES) return null;
  return { memberId, passVersion: Number(parts[2]), signature };
}

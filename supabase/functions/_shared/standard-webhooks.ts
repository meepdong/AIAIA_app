// Standard Webhooks signature verification (https://www.standardwebhooks.com), as used by
// Supabase Auth hooks. Web Crypto only, so it runs in Edge Functions and in `deno test`.
//
// Signed content is `${webhook-id}.${webhook-timestamp}.${raw body}`, HMAC-SHA256 with the
// decoded secret, base64 encoded, sent as one or more space-separated `v1,<sig>` entries.

export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type WebhookVerification = { ok: true } | { ok: false; reason: string };

const encoder = new TextEncoder();

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Accepts `v1,whsec_<base64>` (what Supabase shows), `whsec_<base64>` or the bare base64. */
export function decodeSecret(secret: string): Uint8Array<ArrayBuffer> {
  const withoutVersion = secret.startsWith('v1,') ? secret.slice(3) : secret;
  const withoutPrefix = withoutVersion.startsWith('whsec_')
    ? withoutVersion.slice('whsec_'.length)
    : withoutVersion;
  return base64ToBytes(withoutPrefix);
}

/** Constant-time comparison of two strings of any length. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const length = Math.max(x.length, y.length);
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function signPayload(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    decodeSecret(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${body}`));
  return bytesToBase64(new Uint8Array(mac));
}

/**
 * Verifies a webhook request. `headers` is the request's Headers; `body` the RAW text (never a
 * re-serialised JSON). `now` is injectable for tests (milliseconds).
 */
export async function verifyWebhook(
  secret: string,
  headers: Headers,
  body: string,
  options: { toleranceSeconds?: number; now?: number } = {},
): Promise<WebhookVerification> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing headers' };

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return { ok: false, reason: 'bad timestamp' };
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - seconds) > tolerance) return { ok: false, reason: 'stale timestamp' };

  let expected: string;
  try {
    expected = await signPayload(secret, id, timestamp, body);
  } catch {
    return { ok: false, reason: 'bad secret' };
  }

  for (const entry of signatureHeader.split(' ')) {
    const [version, signature] = entry.split(',');
    if (version === 'v1' && signature && timingSafeEqual(signature, expected)) return { ok: true };
  }
  return { ok: false, reason: 'signature mismatch' };
}

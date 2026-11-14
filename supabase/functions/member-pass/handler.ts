// member-pass: signs the static delegate pass of the caller and of their active wards, or (with a
// `scope` body) the passes an officer may bulk-print for a branch or an event (bulk_passes()).
// verify_jwt stays on. The rows come from public.my_passes(), called with the caller's own JWT,
// so the database decides who gets a pass (active caller, active guardian links only).
// The QR format must match packages/api/src/checkin/format.ts (cross-checked by the tests).

export type PassRow = {
  member_id: string;
  full_name: string;
  branch_name: string;
  pass_version: number;
  is_self: boolean;
};

export type BulkRow = Omit<PassRow, 'is_self'>;

/** A bulk-print scope: exactly one of a branch or an event. The database builds the member list. */
export type BulkScope = { branch_id: string } | { event_id: string };

export type Deps = {
  /** PASS_SIGNING_PRIVATE_KEY: base64url of the 32-byte Ed25519 seed. */
  signingSeed: string | undefined;
  /** Calls my_passes() as the caller (their Authorization header). */
  listPasses: (authorization: string) => Promise<PassRow[]>;
  /**
   * Calls bulk_passes(scope) as the caller. On a database error it throws an Error whose message is
   * the Postgres error code only (42501 refused, 54000 over the cap, 22023 bad scope).
   */
  listBulkPasses: (authorization: string, scope: BulkScope) => Promise<BulkRow[]>;
};

/**
 * The request body names a scope, never member ids: `{ "scope": { "branch_id": "<uuid>" } }` or
 * `{ "scope": { "event_id": "<uuid>" } }`. Anything else in the body is ignored. Returns null for
 * a malformed scope.
 */
export function parseScope(scope: unknown): BulkScope | null {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
  const keys = Object.keys(scope);
  if (keys.length !== 1) return null;
  const value = (scope as Record<string, unknown>)[keys[0]];
  if (typeof value !== 'string' || !UUID_RE.test(value.toLowerCase())) return null;
  if (keys[0] === 'branch_id') return { branch_id: value.toLowerCase() };
  if (keys[0] === 'event_id') return { event_id: value.toLowerCase() };
  return null;
}

const BULK_ERRORS: Record<string, [number, string]> = {
  '42501': [403, 'forbidden'],
  '54000': [413, 'too many'],
  '22023': [400, 'bad request'],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// PKCS#8 wrapper for a raw Ed25519 seed (RFC 8410): SEQUENCE { 0, { 1.3.101.112 }, OCTET STRING }.
const PKCS8_PREFIX = [
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function importSigningKey(seed: string | undefined): Promise<CryptoKey | null> {
  const raw = seed ? base64UrlDecode(seed.trim()) : null;
  if (!raw || raw.length !== 32) return null;
  const pkcs8 = new Uint8Array([...PKCS8_PREFIX, ...raw]);
  try {
    return await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  } catch {
    return null;
  }
}

export function passMessage(memberId: string, passVersion: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`v1|${memberId}|${passVersion}`);
}

export async function signPass(
  key: CryptoKey,
  memberId: string,
  passVersion: number,
): Promise<string> {
  if (!UUID_RE.test(memberId)) throw new Error('bad member id');
  if (!Number.isInteger(passVersion) || passVersion < 1) throw new Error('bad pass_version');
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, key, passMessage(memberId, passVersion)),
  );
  const id = Uint8Array.from(memberId.replace(/-/g, '').match(/../g)!, (h) => parseInt(h, 16));
  return `AIAIA1.${base64UrlEncode(id)}.${passVersion}.${base64UrlEncode(sig)}`;
}

export function createHandler(deps: Deps) {
  let key: Promise<CryptoKey | null> | undefined;
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

    key ??= importSigningKey(deps.signingSeed);
    const signingKey = await key;
    if (!signingKey) {
      // Fail closed. Never log the secret or why it failed to parse.
      console.error('member-pass: signing key missing or invalid');
      return json(503, { error: 'not configured' });
    }

    // An empty body is the caller's own passes (chunk 1); a body with `scope` is a bulk print.
    let body: Record<string, unknown> = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        body = parsed;
      } catch {
        return json(400, { error: 'bad request' });
      }
    }

    if ('scope' in body) {
      const scope = parseScope(body.scope);
      if (!scope) return json(400, { error: 'bad request' });
      let bulk: BulkRow[];
      try {
        bulk = await deps.listBulkPasses(authorization, scope);
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        const known = BULK_ERRORS[code];
        if (known) return json(known[0], { error: known[1] });
        console.error('member-pass: bulk_passes failed');
        return json(500, { error: 'failed' });
      }
      const passes = [];
      for (const r of bulk) {
        passes.push({
          member_id: r.member_id,
          full_name: r.full_name,
          branch_name: r.branch_name,
          pass_version: r.pass_version,
          qr: await signPass(signingKey, r.member_id, r.pass_version),
        });
      }
      return json(200, { passes });
    }

    let rows: PassRow[];
    try {
      rows = await deps.listPasses(authorization);
    } catch (err) {
      // Never echo the database error.
      console.error('member-pass: my_passes failed', err instanceof Error ? err.name : 'error');
      return json(500, { error: 'failed' });
    }

    const passes = [];
    for (const r of rows) {
      passes.push({
        member_id: r.member_id,
        full_name: r.full_name,
        branch_name: r.branch_name,
        pass_version: r.pass_version,
        is_self: r.is_self,
        qr: await signPass(signingKey, r.member_id, r.pass_version),
      });
    }
    return json(200, { passes });
  };
}

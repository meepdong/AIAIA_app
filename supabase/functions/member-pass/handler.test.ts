// deno test -A supabase/functions/member-pass
// Keys are generated at test time; nothing secret is committed.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  parsePassQr,
  passMessage as appMessage,
} from '../../../packages/api/src/checkin/format.ts';
import { base64UrlEncode, createHandler, importSigningKey, type PassRow } from './handler.ts';

const SELF: PassRow = {
  member_id: 'a0000000-0000-4000-8000-000000000013',
  full_name: 'Vikram Fixture',
  branch_name: 'Branch A',
  pass_version: 1,
  is_self: true,
};
const WARD: PassRow = {
  member_id: 'a0000000-0000-4000-8000-000000000021',
  full_name: 'Kiran Fixture',
  branch_name: 'Branch A',
  pass_version: 4,
  is_self: false,
};

async function testKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { seed: base64UrlEncode(pkcs8.slice(-32)), publicKey: pair.publicKey };
}

function call(handler: (r: Request) => Promise<Response>, init: RequestInit = {}) {
  return handler(
    new Request('http://localhost/member-pass', {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-jwt' },
      ...init,
    }),
  );
}

async function verifyQr(qr: string, publicKey: CryptoKey): Promise<boolean> {
  const p = parsePassQr(qr);
  if (!p) return false;
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    new Uint8Array(p.signature),
    new Uint8Array(appMessage(p.memberId, p.passVersion)),
  );
}

Deno.test('signs the caller and active wards from my_passes, with the caller JWT', async () => {
  const { seed, publicKey } = await testKeys();
  const seen: string[] = [];
  const handler = createHandler({
    signingSeed: seed,
    listPasses: (auth) => {
      seen.push(auth);
      return Promise.resolve([SELF, WARD]);
    },
  });
  const res = await call(handler);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(seen, ['Bearer caller-jwt']);
  assertEquals(body.passes.length, 2);
  for (const [i, row] of [SELF, WARD].entries()) {
    const pass = body.passes[i];
    assertEquals({ ...pass, qr: undefined }, { ...row, qr: undefined });
    const parsed = parsePassQr(pass.qr);
    assertEquals(parsed?.memberId, row.member_id, 'the app parser reads what the function writes');
    assertEquals(parsed?.passVersion, row.pass_version);
    assert(await verifyQr(pass.qr, publicKey), 'signature verifies with the public key');
  }
});

Deno.test('the pass is static: the same QR every time, so it can be printed', async () => {
  const { seed } = await testKeys();
  const handler = createHandler({ signingSeed: seed, listPasses: () => Promise.resolve([SELF]) });
  const a = (await (await call(handler)).json()).passes[0].qr;
  const b = (await (await call(handler)).json()).passes[0].qr;
  assertEquals(a, b);
});

Deno.test('tampered QR rejected: a member id swapped under the signature fails', async () => {
  const { seed, publicKey } = await testKeys();
  const handler = createHandler({
    signingSeed: seed,
    listPasses: () => Promise.resolve([SELF, WARD]),
  });
  const [self, ward] = (await (await call(handler)).json()).passes.map((p: { qr: string }) =>
    p.qr.split('.'),
  );
  const tampered = [self[0], ward[1], self[2], self[3]].join('.');
  assertEquals(await verifyQr(tampered, publicKey), false);
  const other = await testKeys();
  assertEquals(await verifyQr(self.join('.'), other.publicKey), false, 'wrong key rejected');
});

Deno.test('a missing or invalid signing key fails closed with 503', async () => {
  for (const seed of [undefined, '', 'not-base64!', base64UrlEncode(new Uint8Array(31))]) {
    let called = false;
    const handler = createHandler({
      signingSeed: seed,
      listPasses: () => {
        called = true;
        return Promise.resolve([SELF]);
      },
    });
    const res = await call(handler);
    assertEquals(res.status, 503);
    assertEquals(await res.json(), { error: 'not configured' });
    assertEquals(called, false);
  }
});

Deno.test('no bearer token: 401 and my_passes is not called', async () => {
  const { seed } = await testKeys();
  let called = false;
  const handler = createHandler({
    signingSeed: seed,
    listPasses: () => {
      called = true;
      return Promise.resolve([SELF]);
    },
  });
  assertEquals((await call(handler, { headers: {} })).status, 401);
  assertEquals(called, false);
});

Deno.test('a database error is not echoed', async () => {
  const { seed } = await testKeys();
  const handler = createHandler({
    signingSeed: seed,
    listPasses: () => Promise.reject(new Error('row a0000000 secret detail')),
  });
  const res = await call(handler);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'failed' });
});

Deno.test('an inactive caller (no rows) gets no passes', async () => {
  const { seed } = await testKeys();
  const handler = createHandler({ signingSeed: seed, listPasses: () => Promise.resolve([]) });
  assertEquals(await (await call(handler)).json(), { passes: [] });
});

Deno.test('only POST and the CORS preflight are accepted', async () => {
  const { seed } = await testKeys();
  const handler = createHandler({ signingSeed: seed, listPasses: () => Promise.resolve([SELF]) });
  assertEquals((await call(handler, { method: 'GET' })).status, 405);
  const pre = await call(handler, { method: 'OPTIONS', headers: {} });
  assertEquals(pre.status, 200);
  await pre.body?.cancel();
});

Deno.test('importSigningKey accepts exactly a 32-byte base64url seed', async () => {
  const { seed } = await testKeys();
  assert(await importSigningKey(seed));
  assertEquals(await importSigningKey(seed + 'AA'), null);
});

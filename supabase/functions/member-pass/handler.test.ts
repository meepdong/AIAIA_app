// deno test -A supabase/functions/member-pass
// Keys are generated at test time; nothing secret is committed.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  parsePassQr,
  passMessage as appMessage,
} from '../../../packages/api/src/checkin/format.ts';
import {
  base64UrlEncode,
  createHandler,
  type Deps,
  importSigningKey,
  type PassRow,
} from './handler.ts';

const noBulk: Deps['listBulkPasses'] = () =>
  Promise.reject(new Error('bulk_passes must not be called'));

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
    listBulkPasses: noBulk,
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
  const handler = createHandler({
    signingSeed: seed,
    listBulkPasses: noBulk,
    listPasses: () => Promise.resolve([SELF]),
  });
  const a = (await (await call(handler)).json()).passes[0].qr;
  const b = (await (await call(handler)).json()).passes[0].qr;
  assertEquals(a, b);
});

Deno.test('tampered QR rejected: a member id swapped under the signature fails', async () => {
  const { seed, publicKey } = await testKeys();
  const handler = createHandler({
    signingSeed: seed,
    listBulkPasses: noBulk,
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
      listBulkPasses: noBulk,
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
    listBulkPasses: noBulk,
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
    listBulkPasses: noBulk,
    listPasses: () => Promise.reject(new Error('row a0000000 secret detail')),
  });
  const res = await call(handler);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'failed' });
});

Deno.test('an inactive caller (no rows) gets no passes', async () => {
  const { seed } = await testKeys();
  const handler = createHandler({
    signingSeed: seed,
    listBulkPasses: noBulk,
    listPasses: () => Promise.resolve([]),
  });
  assertEquals(await (await call(handler)).json(), { passes: [] });
});

Deno.test('only POST and the CORS preflight are accepted', async () => {
  const { seed } = await testKeys();
  const handler = createHandler({
    signingSeed: seed,
    listBulkPasses: noBulk,
    listPasses: () => Promise.resolve([SELF]),
  });
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

// ===== bulk print (scope body) =====
const BRANCH = 'c0000000-0000-4000-8000-00000000000a';
const EVENT = 'e0000000-0000-4000-8000-0000000007b1';
const BULK = [SELF, WARD].map(({ is_self: _s, ...r }) => r);

function bulkHandler(seed: string, list: Deps['listBulkPasses']) {
  return createHandler({
    signingSeed: seed,
    listPasses: () => Promise.reject(new Error('my_passes must not be called for a bulk print')),
    listBulkPasses: list,
  });
}

const post = (body: unknown) => ({ body: JSON.stringify(body) });

Deno.test(
  'bulk: signs exactly the rows bulk_passes returns, and they verify with the public key',
  async () => {
    const { seed, publicKey } = await testKeys();
    const seen: unknown[] = [];
    const handler = bulkHandler(seed, (auth, scope) => {
      seen.push([auth, scope]);
      return Promise.resolve(BULK);
    });
    // Client-supplied member ids are ignored: only the scope reaches the database.
    const res = await call(
      handler,
      post({ scope: { event_id: EVENT }, member_ids: ['a0000000-0000-4000-8000-0000000000ff'] }),
    );
    assertEquals(res.status, 200);
    assertEquals(seen, [['Bearer caller-jwt', { event_id: EVENT }]]);
    const { passes } = await res.json();
    assertEquals(
      passes.map((p: { member_id: string }) => p.member_id),
      BULK.map((r) => r.member_id),
    );
    for (const pass of passes) assert(await verifyQr(pass.qr, publicKey), 'bulk QR verifies');
    assertEquals(
      passes[0].qr,
      (
        await (
          await call(
            createHandler({
              signingSeed: seed,
              listBulkPasses: noBulk,
              listPasses: () => Promise.resolve([SELF]),
            }),
          )
        ).json()
      ).passes[0].qr,
      'a bulk QR is the same static pass',
    );
  },
);

Deno.test('bulk: a refused caller gets a JSON 403 and nothing is signed', async () => {
  const { seed } = await testKeys();
  const handler = bulkHandler(seed, () => Promise.reject(new Error('42501')));
  const res = await call(handler, post({ scope: { branch_id: BRANCH } }));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get('Content-Type'), 'application/json');
  assertEquals(await res.json(), { error: 'forbidden' });
});

Deno.test('bulk: over the cap is 413, and other database errors are not echoed', async () => {
  const { seed } = await testKeys();
  const over = await call(
    bulkHandler(seed, () => Promise.reject(new Error('54000'))),
    post({ scope: { branch_id: BRANCH } }),
  );
  assertEquals([over.status, await over.json()], [413, { error: 'too many' }]);
  const other = await call(
    bulkHandler(seed, () => Promise.reject(new Error('XX000 row a0000000 secret detail'))),
    post({ scope: { branch_id: BRANCH } }),
  );
  assertEquals([other.status, await other.json()], [500, { error: 'failed' }]);
});

Deno.test('bulk: a malformed scope is 400 and bulk_passes is not called', async () => {
  const { seed } = await testKeys();
  let called = false;
  const handler = bulkHandler(seed, () => {
    called = true;
    return Promise.resolve(BULK);
  });
  for (const scope of [
    null,
    {},
    { branch_id: BRANCH, event_id: EVENT },
    { member_id: BRANCH },
    { branch_id: 'not-a-uuid' },
    [BRANCH],
  ]) {
    const res = await call(handler, post({ scope }));
    assertEquals([res.status, await res.json()], [400, { error: 'bad request' }]);
  }
  const bad = await call(handler, { body: '{not json' });
  assertEquals([bad.status, await bad.json()], [400, { error: 'bad request' }]);
  assertEquals(called, false);
});

Deno.test('bulk: no bearer token is 401 before anything else', async () => {
  const { seed } = await testKeys();
  const res = await call(
    bulkHandler(seed, () => Promise.resolve(BULK)),
    { headers: {}, ...post({ scope: { branch_id: BRANCH } }) },
  );
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

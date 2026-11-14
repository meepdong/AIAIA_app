// deno test supabase/functions/auth-send-otp
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1';
import { sendMsg91Otp } from '../_shared/msg91.ts';
import { signPayload, verifyWebhook } from '../_shared/standard-webhooks.ts';
import { sendWhatsAppAuthTemplate } from '../_shared/whatsapp.ts';
import {
  createHandler,
  hashPhone,
  MAX_PER_DAY,
  MAX_PER_HOUR,
  type ThrottleStore,
} from './handler.ts';
import { createPostgresThrottleStore, type ThrottleTableClient } from './throttle.ts';

// Fake secret and fake numbers (+91 90000 000xx) only.
const SECRET = `v1,whsec_${btoa('test-hook-secret-0123456789abcdef')}`;
const THROTTLE_KEY = 'test-throttle-key';
const PHONE = '919000000001'; // how Supabase sends it: no +
const OTP = '482913';
const NOW = Date.UTC(2026, 10, 15, 6, 0, 0);

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// In-memory fake of public.otp_throttle_take: the same check-and-record rules, at a fixed clock.
function memoryStore(clock: () => number = () => NOW) {
  const rows: { hash: string; at: Date }[] = [];
  const purges: Date[] = [];
  const store: ThrottleStore = {
    take: (hash) => {
      const nowMs = clock();
      const sent = rows
        .filter((r) => r.hash === hash && nowMs - r.at.getTime() < DAY_MS)
        .map((r) => r.at.getTime())
        .sort((a, b) => a - b);
      const inLastHour = sent.filter((t) => nowMs - t < HOUR_MS);
      const hourBlocked = inLastHour.length >= MAX_PER_HOUR;
      const dayBlocked = sent.length >= MAX_PER_DAY;
      if (hourBlocked || dayBlocked) {
        const hourRetry = hourBlocked ? inLastHour[inLastHour.length - MAX_PER_HOUR] + HOUR_MS : 0;
        const dayRetry = dayBlocked ? sent[sent.length - MAX_PER_DAY] + DAY_MS : 0;
        return Promise.resolve({
          allowed: false,
          retryAt: new Date(Math.max(hourRetry, dayRetry)),
        });
      }
      rows.push({ hash, at: new Date(nowMs) });
      return Promise.resolve({ allowed: true });
    },
    purgeOlderThan: (cutoff) => {
      purges.push(cutoff);
      return Promise.resolve();
    },
  };
  return { store, rows, purges };
}

async function signedRequest(
  payload: unknown,
  options: { secret?: string; timestampMs?: number; tamper?: boolean; id?: string } = {},
): Promise<Request> {
  const body = JSON.stringify(payload);
  const id = options.id ?? `msg_${crypto.randomUUID()}`;
  const timestamp = String(Math.floor((options.timestampMs ?? NOW) / 1000));
  const signature = await signPayload(options.secret ?? SECRET, id, timestamp, body);
  return new Request('http://localhost/auth-send-otp', {
    method: 'POST',
    headers: {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
      'content-type': 'application/json',
    },
    body: options.tamper ? body.replace(OTP, '000000') : body,
  });
}

const hookPayload = (phone = PHONE, otp = OTP) => ({
  user: { id: 'f0000000-0000-4000-8000-000000000001', phone },
  sms: { otp },
});

function build(overrides: Partial<Parameters<typeof createHandler>[0]> = {}, nowMs = NOW) {
  const mem = memoryStore(() => nowMs);
  const whatsappCalls: { to: string; code: string }[] = [];
  const msg91Calls: { to: string; code: string }[] = [];
  const handler = createHandler({
    hookSecret: SECRET,
    throttleKey: THROTTLE_KEY,
    store: mem.store,
    allowInternational: false,
    now: () => nowMs,
    random: () => 0.99,
    sendWhatsApp: (to, code) => {
      whatsappCalls.push({ to, code });
      return Promise.resolve({ ok: true, status: 200 });
    },
    sendMsg91: (to, code) => {
      msg91Calls.push({ to, code });
      return Promise.resolve({ ok: true, status: 200 });
    },
    ...overrides,
  });
  return { handler, whatsappCalls, msg91Calls, ...mem };
}

Deno.test('a bad signature is rejected with 401 and nothing is sent', async () => {
  const { handler, whatsappCalls, rows } = build();
  const wrongSecret = `v1,whsec_${btoa('some-other-secret-value-0123456789')}`;
  const forged = await handler(await signedRequest(hookPayload(), { secret: wrongSecret }));
  assertEquals(forged.status, 401);
  const tampered = await handler(await signedRequest(hookPayload(), { tamper: true }));
  assertEquals(tampered.status, 401);
  const unsigned = await handler(
    new Request('http://localhost/', { method: 'POST', body: JSON.stringify(hookPayload()) }),
  );
  assertEquals(unsigned.status, 401);
  const stale = await handler(await signedRequest(hookPayload(), { timestampMs: NOW - 3_600_000 }));
  assertEquals(stale.status, 401);
  assertEquals(whatsappCalls.length, 0);
  assertEquals(rows.length, 0);
});

Deno.test(
  'webhook verification accepts a good signature and tolerates a rotated list',
  async () => {
    const body = '{"a":1}';
    const sig = await signPayload(SECRET, 'id1', String(NOW / 1000), body);
    const headers = new Headers({
      'webhook-id': 'id1',
      'webhook-timestamp': String(NOW / 1000),
      'webhook-signature': `v1,AAAA v1,${sig}`,
    });
    assertEquals((await verifyWebhook(SECRET, headers, body, { now: NOW })).ok, true);
    assertEquals((await verifyWebhook(SECRET, headers, body + ' ', { now: NOW })).ok, false);
  },
);

Deno.test('WhatsApp success returns 200 and sends the code to the +91 number', async () => {
  const { handler, whatsappCalls, msg91Calls, rows } = build();
  const response = await handler(await signedRequest(hookPayload()));
  assertEquals(response.status, 200);
  assert(response.headers.get('content-type')?.startsWith('application/json'));
  assertEquals(await response.json(), {});
  assertEquals(whatsappCalls, [{ to: '+919000000001', code: OTP }]);
  assertEquals(msg91Calls.length, 0);
  assertEquals(rows.length, 1);
});

Deno.test('the throttle stores an HMAC of the phone, never the number', async () => {
  const { handler, rows } = build();
  await handler(await signedRequest(hookPayload()));
  const expected = await hashPhone(THROTTLE_KEY, '+919000000001');
  assertEquals(rows[0].hash, expected);
  assertEquals(expected.length, 64);
  assertNotEquals(await hashPhone('another-key', '+919000000001'), expected);
  assert(!rows[0].hash.includes('9000000001'));
});

Deno.test('the 6th send within an hour is refused with 429', async () => {
  const { handler, whatsappCalls } = build();
  for (let i = 0; i < MAX_PER_HOUR; i++) {
    assertEquals((await handler(await signedRequest(hookPayload()))).status, 200);
  }
  const sixth = await handler(await signedRequest(hookPayload()));
  assertEquals(sixth.status, 200);
  assert(sixth.headers.get('content-type')?.startsWith('application/json'));
  const body = await sixth.json();
  assertEquals(body.error.http_code, 429);
  assertStringIncludes(body.error.message, 'Try again in 60 minutes');
  assertEquals(whatsappCalls.length, MAX_PER_HOUR);
  // Another number is unaffected.
  const other = await handler(await signedRequest(hookPayload('919000000002')));
  assertEquals(other.status, 200);
});

Deno.test('the 11th send within a day is refused even when spaced out hourly', async () => {
  const mem = memoryStore();
  const hash = await hashPhone(THROTTLE_KEY, '+919000000001');
  // Ten sends, one every 2 hours, the last 5 minutes ago: no hour limit hit, day limit full.
  for (let i = 0; i < 10; i++) {
    mem.rows.push({ hash, at: new Date(NOW - 5 * 60_000 - (9 - i) * 2 * 3_600_000) });
  }
  const handler = createHandler({
    hookSecret: SECRET,
    throttleKey: THROTTLE_KEY,
    store: mem.store,
    allowInternational: false,
    now: () => NOW,
    random: () => 0.99,
    sendWhatsApp: () => Promise.resolve({ ok: true, status: 200 }),
  });
  const response = await handler(await signedRequest(hookPayload()));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.error.http_code, 429);
  // Retry when the oldest of the ten (18h05m ago) ages out of the day: 5h55m from now.
  assertStringIncludes(body.error.message, 'Try again in 355 minutes');
  assertEquals(mem.rows.length, 10);
});

Deno.test('the Postgres store makes one otp_throttle_take call and maps its answer', async () => {
  const calls: { fn: string; args: unknown }[] = [];
  let answer: { data: unknown; error: unknown } = { data: { allowed: true }, error: null };
  const client: ThrottleTableClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
    from: () => ({ delete: () => ({ lt: () => Promise.resolve({ error: null }) }) }),
  };
  const store = createPostgresThrottleStore(client);
  assertEquals(await store.take('a'.repeat(64)), { allowed: true });
  assertEquals(calls, [{ fn: 'otp_throttle_take', args: { p_hash: 'a'.repeat(64) } }]);

  answer = { data: { allowed: false, retry_at: '2026-11-15T07:00:00+00:00' }, error: null };
  assertEquals(await store.take('a'.repeat(64)), {
    allowed: false,
    retryAt: new Date(Date.UTC(2026, 10, 15, 7, 0, 0)),
  });

  // A failed or malformed answer never counts as allowed.
  answer = { data: null, error: { message: 'permission denied' } };
  await assertRejects(() => store.take('a'.repeat(64)));
  answer = { data: { allowed: 'yes' }, error: null };
  await assertRejects(() => store.take('a'.repeat(64)));
  answer = { data: { allowed: false }, error: null };
  await assertRejects(() => store.take('a'.repeat(64)));
});

Deno.test('non +91 numbers are rejected unless international is allowed', async () => {
  const blocked = build();
  const refused = await blocked.handler(await signedRequest(hookPayload('14155550100')));
  assertEquals(refused.status, 200);
  assertEquals((await refused.json()).error.http_code, 400);
  assertEquals(blocked.whatsappCalls.length, 0);
  assertEquals(blocked.rows.length, 0);

  const allowed = build({ allowInternational: true });
  const ok = await allowed.handler(await signedRequest(hookPayload('14155550100')));
  assertEquals(ok.status, 200);
  assertEquals(allowed.whatsappCalls[0].to, '+14155550100');
});

Deno.test('a WhatsApp failure falls back to MSG91', async () => {
  const { handler, msg91Calls } = build({
    sendWhatsApp: () => Promise.resolve({ ok: false, status: 500 }),
  });
  const response = await handler(await signedRequest(hookPayload()));
  assertEquals(response.status, 200);
  assertEquals(msg91Calls, [{ to: '+919000000001', code: OTP }]);
});

Deno.test('with WhatsApp not configured the code goes to MSG91', async () => {
  const { handler, msg91Calls } = build({ sendWhatsApp: undefined });
  assertEquals((await handler(await signedRequest(hookPayload()))).status, 200);
  assertEquals(msg91Calls.length, 1);
});

Deno.test('when every provider fails the answer is 502', async () => {
  const { handler, rows } = build({
    sendWhatsApp: () => Promise.resolve({ ok: false, status: 500 }),
    sendMsg91: () => Promise.resolve({ ok: false, status: 0 }),
  });
  const response = await handler(await signedRequest(hookPayload()));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).error.http_code, 502);
  // Counted before sending: exactly one throttle take, even though nothing was delivered.
  assertEquals(rows.length, 1);
});

Deno.test('old throttle rows are purged opportunistically', async () => {
  const lucky = build({ random: () => 0 });
  await lucky.handler(await signedRequest(hookPayload()));
  assertEquals(lucky.purges.length, 1);
  assertEquals(lucky.purges[0].getTime(), NOW - 2 * 24 * 3_600_000);
  const unlucky = build({ random: () => 0.5 });
  await unlucky.handler(await signedRequest(hookPayload()));
  assertEquals(unlucky.purges.length, 0);
});

Deno.test('the OTP and the phone number never appear in console output', async () => {
  const captured: string[] = [];
  const names = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals = names.map((name) => console[name]);
  for (const name of names) {
    console[name] = (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  }
  try {
    const failing = build({
      sendWhatsApp: () => Promise.resolve({ ok: false, status: 500 }),
      sendMsg91: () => Promise.resolve({ ok: false, status: 502 }),
      random: () => 0,
    });
    await failing.handler(await signedRequest(hookPayload()));
    await failing.handler(await signedRequest(hookPayload('14155550100')));
    await failing.handler(await signedRequest(hookPayload(), { tamper: true }));
    const throwing = build({
      random: () => 0,
      store: {
        ...memoryStore().store,
        purgeOlderThan: () => Promise.reject(new Error(`boom ${OTP} ${PHONE}`)),
      },
    });
    await throwing.handler(await signedRequest(hookPayload()));
  } finally {
    names.forEach((name, i) => (console[name] = originals[i]));
  }
  assert(captured.length > 0, 'the failure paths should log something');
  const output = captured.join('\n');
  assert(!output.includes(OTP), 'OTP leaked into console output');
  assert(!output.includes('9000000001'), 'phone number leaked into console output');
  assert(!output.includes('4155550100'), 'phone number leaked into console output');
});

Deno.test('the WhatsApp sender posts an authentication template', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fake = ((url: string, init: RequestInit) => {
    seen = { url, init };
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch;
  const result = await sendWhatsAppAuthTemplate(
    { accessToken: 'test-token', phoneNumberId: '1234567890' },
    { to: '+919000000001', template: 'aiaia_login_code', code: OTP },
    fake,
  );
  assertEquals(result, { ok: true, status: 200 });
  assertStringIncludes(seen!.url, '/1234567890/messages');
  const body = JSON.parse(seen!.init.body as string);
  assertEquals(body.to, '919000000001');
  assertEquals(body.template.name, 'aiaia_login_code');
  assertEquals(body.template.components[0].parameters[0].text, OTP);
  assertEquals(new Headers(seen!.init.headers).get('authorization'), 'Bearer test-token');
});

Deno.test('the MSG91 sender posts to the flow API and reports network failure', async () => {
  let body: { recipients: { mobiles: string; otp: string }[]; template_id: string } | undefined;
  const ok = ((_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch;
  const config = { authKey: 'test-key', templateId: 'tpl1' };
  assertEquals(await sendMsg91Otp(config, { to: '+919000000001', code: OTP }, ok), {
    ok: true,
    status: 200,
  });
  assertEquals(body!.recipients[0], { mobiles: '919000000001', otp: OTP });
  const down = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
  assertEquals(await sendMsg91Otp(config, { to: '+919000000001', code: OTP }, down), {
    ok: false,
    status: 0,
  });
});

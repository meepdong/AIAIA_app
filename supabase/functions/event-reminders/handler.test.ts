import { assertEquals } from 'jsr:@std/assert@1';
import { createHandler, secretsMatch, type ReminderKind } from './handler.ts';

const SECRET = 'test-secret';

function call(
  handler: (r: Request) => Promise<Response>,
  headers: HeadersInit = {},
  method = 'POST',
) {
  return handler(new Request('http://localhost/event-reminders', { method, headers }));
}

/**
 * Models the database contract: send_event_reminders keeps a ledger of (kind, event, member) and
 * returns only how many reminders it newly sent. Two registrants are due for each kind.
 */
function fakeDatabase() {
  const ledger = new Set<string>();
  const calls: ReminderKind[] = [];
  return {
    calls,
    ledger,
    sendReminders(kind: ReminderKind): Promise<number> {
      calls.push(kind);
      let sent = 0;
      for (const member of ['m1', 'm2']) {
        const key = `${kind}:e1:${member}`;
        if (!ledger.has(key)) {
          ledger.add(key);
          sent++;
        }
      }
      return Promise.resolve(sent);
    },
  };
}

Deno.test('a repeated run sends nothing new: idempotent', async () => {
  const db = fakeDatabase();
  const handler = createHandler({ secret: SECRET, sendReminders: (k) => db.sendReminders(k) });

  const first = await call(handler, { 'x-reminders-secret': SECRET });
  assertEquals(first.status, 200);
  assertEquals(await first.json(), { sent: { '24h': 2, '2h': 2 } });

  const second = await call(handler, { 'x-reminders-secret': SECRET });
  assertEquals(second.status, 200);
  assertEquals(await second.json(), { sent: { '24h': 0, '2h': 0 } });
  assertEquals(db.ledger.size, 4, 'one ledger row per kind and registrant, however often it runs');
});

Deno.test('one run asks the database for each kind exactly once, 24h then 2h', async () => {
  const db = fakeDatabase();
  const handler = createHandler({ secret: SECRET, sendReminders: (k) => db.sendReminders(k) });
  await call(handler, { 'x-reminders-secret': SECRET });
  assertEquals(db.calls, ['24h', '2h']);
});

Deno.test('a missing or wrong secret is refused and sends nothing', async () => {
  const db = fakeDatabase();
  const handler = createHandler({ secret: SECRET, sendReminders: (k) => db.sendReminders(k) });
  assertEquals((await call(handler)).status, 401);
  assertEquals((await call(handler, { 'x-reminders-secret': 'wrong' })).status, 401);
  assertEquals((await call(handler, { 'x-reminders-secret': SECRET + 'x' })).status, 401);
  assertEquals(db.calls, []);
});

Deno.test('an unconfigured function refuses everyone, even an empty secret', async () => {
  const db = fakeDatabase();
  const handler = createHandler({ secret: undefined, sendReminders: (k) => db.sendReminders(k) });
  assertEquals((await call(handler, { 'x-reminders-secret': '' })).status, 503);
  assertEquals(db.calls, []);
});

Deno.test('only POST is accepted', async () => {
  const db = fakeDatabase();
  const handler = createHandler({ secret: SECRET, sendReminders: (k) => db.sendReminders(k) });
  assertEquals((await call(handler, { 'x-reminders-secret': SECRET }, 'GET')).status, 405);
  assertEquals(db.calls, []);
});

Deno.test(
  'a database failure answers 500 without echoing the error and stops the run',
  async () => {
    const calls: ReminderKind[] = [];
    const handler = createHandler({
      secret: SECRET,
      sendReminders: (kind) => {
        calls.push(kind);
        return Promise.reject(new Error('detail naming a member row'));
      },
    });
    const res = await call(handler, { 'x-reminders-secret': SECRET });
    assertEquals(res.status, 500);
    assertEquals(JSON.stringify(await res.json()).includes('member row'), false);
    assertEquals(calls, ['24h']);
  },
);

Deno.test('secretsMatch compares whole values', () => {
  assertEquals(secretsMatch('abc', 'abc'), true);
  assertEquals(secretsMatch('abd', 'abc'), false);
  assertEquals(secretsMatch('ab', 'abc'), false);
  assertEquals(secretsMatch(null, 'abc'), false);
});

// event-reminders: woken hourly by pg_cron (wake_event_reminders). Authenticates with a shared
// secret header, then asks the database to send the 24 h and 2 h reminders. All the work, and the
// idempotency (one reminder per event, member and kind), lives in public.send_event_reminders, so a
// retry or an overlapping run cannot send a reminder twice.

export const REMINDER_KINDS = ['24h', '2h'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type Deps = {
  /** The secret the cron wake-up must present (function secret EVENT_REMINDERS_SECRET). */
  secret: string | undefined;
  /** Calls send_event_reminders(reminder_kind) as the service role; resolves to the number sent. */
  sendReminders: (kind: ReminderKind) => Promise<number>;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Constant-time comparison, so response time does not leak how much of the secret matched. */
export function secretsMatch(given: string | null, expected: string): boolean {
  const a = new TextEncoder().encode(given ?? '');
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return json(405, { error: 'method not allowed' });
    }
    if (!deps.secret) {
      // Fail closed: an unconfigured function must not be callable by anyone.
      return json(503, { error: 'not configured' });
    }
    if (!secretsMatch(req.headers.get('x-reminders-secret'), deps.secret)) {
      return json(401, { error: 'unauthorized' });
    }

    const sent: Record<string, number> = {};
    for (const kind of REMINDER_KINDS) {
      try {
        sent[kind] = await deps.sendReminders(kind);
      } catch (err) {
        // Never echo the database error: it can name rows. The cron job runs again next hour.
        console.error(`event-reminders: ${kind} failed`, err instanceof Error ? err.name : 'error');
        return json(500, { error: 'reminder run failed', sent });
      }
    }
    return json(200, { sent });
  };
}

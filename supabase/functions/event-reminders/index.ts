// Entry point. Deploy with verify_jwt disabled (supabase/config.toml: [functions.event-reminders]):
// the caller is pg_cron through pg_net and authenticates with x-reminders-secret, not a JWT.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createHandler, type ReminderKind } from './handler.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

Deno.serve(
  createHandler({
    secret: Deno.env.get('EVENT_REMINDERS_SECRET'),
    sendReminders: async (kind: ReminderKind) => {
      const { data, error } = await admin.rpc('send_event_reminders', { reminder_kind: kind });
      if (error) throw new Error(error.code ?? 'rpc_error');
      return typeof data === 'number' ? data : 0;
    },
  }),
);

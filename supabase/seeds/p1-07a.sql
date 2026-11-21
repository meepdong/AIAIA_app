-- P1-07a: where the hourly cron wakes event-reminders on the local stack (the database container
-- reaches the API gateway as kong:8000). The secret header value, event_reminders_secret, is never
-- seeded: set it per environment from the function secret EVENT_REMINDERS_SECRET.
insert into public.app_settings (key, value, is_public, description)
values ('event_reminders_url', '"http://kong:8000/functions/v1/event-reminders"'::jsonb, false,
  'URL the hourly cron calls to run event-reminders')
on conflict (key) do nothing;

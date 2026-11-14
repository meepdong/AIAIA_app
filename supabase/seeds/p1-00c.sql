-- P1-00c: where the notification trigger and the pg_cron sweep wake notify-dispatch on the local
-- stack (the database container reaches the API gateway as kong:8000). The secret header value,
-- notify_dispatch_secret, is never seeded: set it per environment from the function secret.
insert into public.app_settings (key, value, is_public, description)
values ('notify_dispatch_url', '"http://kong:8000/functions/v1/notify-dispatch"'::jsonb, false,
  'URL the notification trigger and retry sweep call to wake notify-dispatch')
on conflict (key) do nothing;

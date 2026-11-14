-- P1-00c notification fan-out: deliveries per channel, dependents routed to their guardians, and one
-- batched pg_net wake-up per insert statement. People (seeds/p0-02.sql): dependent_9 has no login and
-- guardian (active link); member_a and member_b are adults with logins.
begin;
select plan(13);

insert into public.app_settings (key, value, description)
values ('notify_dispatch_url', '"http://127.0.0.1:9/functions/v1/notify-dispatch"'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;
insert into public.app_settings (key, value, description)
values ('notify_dispatch_secret', '"test-secret"'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;

insert into public.push_tokens (member_id, platform, token) values
  (tests.member_id('guardian'), 'android', 'test-token-guardian'),
  (tests.member_id('member_a'), 'android', 'test-token-member-a');
insert into public.push_tokens (member_id, platform, subscription) values
  (tests.member_id('member_a'), 'web', '{"endpoint": "https://push.example.test/a"}'::jsonb);
update public.member_private set email = 'arjun.testwala@example.test', email_verified_at = now(),
  notify_prefs = notify_prefs || '{"email_updates": true}'::jsonb
  where member_id = tests.member_id('member_a');
update public.member_private set notify_prefs = notify_prefs || '{"push": false}'::jsonb
  where member_id = tests.member_id('member_b');
insert into public.push_tokens (member_id, platform, token) values
  (tests.member_id('member_b'), 'android', 'test-token-member-b');

-- Dependent without a login: deliveries for the guardian
insert into public.notifications (id, member_id, kind, title)
values ('f1000000-0000-4000-8000-000000000001', tests.member_id('dependent_9'), 'test.dependent', 'For the dependent');
select is(
  (select array_agg(channel order by channel) from public.notification_deliveries
   where notification_id = 'f1000000-0000-4000-8000-000000000001'),
  array['push'], 'a dependent''s notification gets a push delivery for the guardian''s device');

-- Ended guardian link: no route
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
  where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
insert into public.notifications (id, member_id, kind, title)
values ('f1000000-0000-4000-8000-000000000002', tests.member_id('dependent_9'), 'test.dependent', 'After the link ended');
select is_empty($$ select 1 from public.notification_deliveries where notification_id = 'f1000000-0000-4000-8000-000000000002' $$,
  'an ended guardian link gets no deliveries');

-- Own preferences and devices
insert into public.notifications (id, member_id, kind, title)
values ('f1000000-0000-4000-8000-000000000003', tests.member_id('member_a'), 'test.own', 'For member A');
select is(
  (select array_agg(channel order by channel) from public.notification_deliveries
   where notification_id = 'f1000000-0000-4000-8000-000000000003'),
  array['email', 'push', 'webpush'], 'member A gets push, web push and (verified, opted-in) email deliveries');
insert into public.notifications (id, member_id, kind, title)
values ('f1000000-0000-4000-8000-000000000004', tests.member_id('member_b'), 'test.own', 'For member B');
select is_empty($$ select 1 from public.notification_deliveries where notification_id = 'f1000000-0000-4000-8000-000000000004' $$,
  'push turned off and no verified email: no deliveries');

-- Batching: 600 rows in one statement make exactly one pg_net request
create temp table q_before as select count(*) as n from net.http_request_queue;
insert into public.notifications (member_id, kind, title)
select tests.member_id('member_a'), 'test.bulk', 'Bulk ' || g from generate_series(1, 600) g;
select is((select count(*) from net.http_request_queue) - (select n from q_before), 1::bigint,
  'a 600-row bulk insert makes exactly one pg_net request');
select is((select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.kind = 'test.bulk'), 1800, 'every bulk row got its three deliveries');

-- No URL configured: inserts still succeed, no request
delete from public.app_settings where key = 'notify_dispatch_url';
create temp table q_mid as select count(*) as n from net.http_request_queue;
select lives_ok($$ insert into public.notifications (member_id, kind, title)
  values (tests.member_id('member_a'), 'test.nourl', 'No URL') $$, 'a missing dispatch URL never blocks the insert');
select is((select count(*) from net.http_request_queue) - (select n from q_mid), 0::bigint, 'no request without a URL');

-- The secret never leaves over plain http to a foreign host, and is never sent empty
insert into public.app_settings (key, value, description)
values ('notify_dispatch_url', '"http://example.com/functions/v1/notify-dispatch"'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;
create temp table q_http as select count(*) as n from net.http_request_queue;
select lives_ok($$ select public.wake_notify_dispatch() $$, 'waking with an http URL to a foreign host does not raise');
select is((select count(*) from net.http_request_queue) - (select n from q_http), 0::bigint,
  'no request with the secret to an http:// foreign host');
update public.app_settings set value = '"https://example.com/functions/v1/notify-dispatch"'::jsonb where key = 'notify_dispatch_url';
delete from public.app_settings where key = 'notify_dispatch_secret';
select lives_ok($$ select public.wake_notify_dispatch() $$, 'waking without a secret does not raise');
select is((select count(*) from net.http_request_queue) - (select n from q_http), 0::bigint,
  'no request when the dispatch secret is missing');

-- The retry sweep is scheduled every minute
select is((select schedule from cron.job where jobname = 'notify-dispatch-sweep'), '* * * * *',
  'pg_cron sweeps notify-dispatch every minute');

select * from finish();
rollback;

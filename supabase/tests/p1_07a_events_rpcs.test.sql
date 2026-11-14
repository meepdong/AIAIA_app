-- P1-07a gaps: reminders and cancellations for a dependent without a login (routed to ACTIVE
-- guardians only), event_spots visibility, my_event_duties filters.
-- Events e8...01-05 are branch A, created by the national president. dependent_9 has no login; the
-- guardian holds an active link (seeds/p0-02.sql).
begin;
select plan(10);

insert into public.push_tokens (member_id, platform, token) values (tests.member_id('guardian'), 'android', 'test-token-guardian');

insert into public.events (id, scope, branch_id, audience, title, venue_name, starts_at, ends_at, status, created_by) values
  ('e8000000-0000-4000-8000-000000000001', 'branch', tests.branch_id('A'), 'all', 'P1-07a dependent reminder', 'Test Hall', now() + interval '10 hours', now() + interval '12 hours', 'published', tests.member_id('national_president')),
  ('e8000000-0000-4000-8000-000000000002', 'branch', tests.branch_id('A'), 'all', 'P1-07a dependent cancel', 'Test Hall', now() + interval '50 hours', now() + interval '52 hours', 'published', tests.member_id('national_president')),
  ('e8000000-0000-4000-8000-000000000003', 'branch', tests.branch_id('A'), 'all', 'P1-07a draft', null, now() + interval '10 hours', now() + interval '12 hours', 'draft', tests.member_id('national_president')),
  ('e8000000-0000-4000-8000-000000000004', 'branch', tests.branch_id('A'), 'all', 'P1-07a long past', null, now() - interval '10 days', now() - interval '10 days' + interval '2 hours', 'published', tests.member_id('national_president')),
  ('e8000000-0000-4000-8000-000000000005', 'branch', tests.branch_id('A'), 'all', 'P1-07a upcoming duty', null, now() + interval '5 days', now() + interval '5 days' + interval '2 hours', 'published', tests.member_id('national_president'));
create function pg_temp.ev(nn text) returns uuid language sql as $$ select ('e8000000-0000-4000-8000-0000000000' || nn)::uuid $$;

-- Dependent: the reminder reaches the active guardian
insert into public.rsvps (event_id, member_id, status) values
  (pg_temp.ev('01'), tests.member_id('dependent_9'), 'going'),
  (pg_temp.ev('02'), tests.member_id('dependent_9'), 'going');
select is(public.send_event_reminders('24h'), 1, 'the dependent (no login) is reminded');
select is((select array_agg(d.channel) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.kind = 'event.reminder_24h' and n.member_id = tests.member_id('dependent_9')), array['push'],
  'the reminder is delivered to the active guardian''s device');

-- Link ended: the cancellation reaches nobody
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
  where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
update public.events set status = 'cancelled' where id = pg_temp.ev('02');
select is((select count(*)::int from public.notifications where kind = 'event.cancelled' and member_id = tests.member_id('dependent_9')), 1,
  'the dependent''s cancellation notification exists');
select is_empty($$ select 1 from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.kind = 'event.cancelled' and n.member_id = tests.member_id('dependent_9') $$,
  'with the guardian link ended there is no delivery to the former guardian');

-- event_spots
select tests.authenticate_as('bp_a');
select is((select going from public.event_spots(array[pg_temp.ev('03')])), 0, 'a scope officer sees counts for a draft event');
select tests.authenticate_as('member_a');
select is_empty($$ select * from public.event_spots(array[pg_temp.ev('03')]) $$, 'a member gets nothing for a draft event');
select tests.authenticate_as('member_b');
select is_empty($$ select * from public.event_spots(array[pg_temp.ev('01')]) $$, 'another branch''s member gets nothing for a branch A event');
select tests.clear_auth();

-- my_event_duties
insert into public.event_staff (event_id, member_id, capabilities)
select e, m, array['check_in']
from unnest(array[pg_temp.ev('03'), pg_temp.ev('04'), pg_temp.ev('05')]) e,
     unnest(array[tests.member_id('suspended'), tests.member_id('member_b')]) m;
select tests.authenticate_as('member_b');
select is((select array_agg(event_id) from public.my_event_duties()), array[pg_temp.ev('05')],
  'an active staff member sees only the upcoming published event: not the draft, not the long-past one');
select tests.authenticate_as('suspended');
select is_empty($$ select * from public.my_event_duties() $$, 'a suspended staff member sees no duties');
select tests.clear_auth();
select is((select count(*)::int from public.event_staff where member_id = tests.member_id('suspended')), 3,
  'the suspended member does have staff rows, so the empty result is the guard at work');

select * from finish();
rollback;

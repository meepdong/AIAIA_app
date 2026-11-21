-- P1-07a: event reminders (send_event_reminders, idempotency), cancellation and waitlist-promotion
-- notifications, and the read RPCs (event_spots, event_attendees, event_team, my_event_duties).
-- Events e7...01-05 are branch A, audience all, created by the national president.
begin;
select plan(58);

insert into public.events (id, scope, branch_id, audience, title, venue_name, starts_at, ends_at, capacity, status, created_by)
values
  ('e7000000-0000-4000-8000-000000000001', 'branch', tests.branch_id('A'), 'all', 'P1-07a day-ahead', 'Test Hall', now() + interval '10 hours', now() + interval '12 hours', null, 'published', tests.member_id('national_president')),
  ('e7000000-0000-4000-8000-000000000002', 'branch', tests.branch_id('A'), 'all', 'P1-07a far away', null, now() + interval '30 hours', now() + interval '32 hours', null, 'published', tests.member_id('national_president')),
  ('e7000000-0000-4000-8000-000000000003', 'branch', tests.branch_id('A'), 'all', 'P1-07a soon', null, now() + interval '1 hour', now() + interval '3 hours', null, 'published', tests.member_id('national_president')),
  ('e7000000-0000-4000-8000-000000000004', 'branch', tests.branch_id('A'), 'all', 'P1-07a draft', null, now() + interval '10 hours', now() + interval '12 hours', null, 'draft', tests.member_id('national_president')),
  ('e7000000-0000-4000-8000-000000000005', 'branch', tests.branch_id('A'), 'all', 'P1-07a capacity one', null, now() + interval '40 hours', now() + interval '42 hours', 1, 'published', tests.member_id('national_president'));
-- Registrations written as owner (rsvp() itself is covered by p1_00c_events).
insert into public.rsvps (event_id, member_id, status) values
  ('e7000000-0000-4000-8000-000000000001', tests.member_id('member_a'), 'going'),
  ('e7000000-0000-4000-8000-000000000001', tests.member_id('minor_16'), 'going'),
  ('e7000000-0000-4000-8000-000000000001', tests.member_id('guardian'), 'waitlisted'),
  ('e7000000-0000-4000-8000-000000000001', tests.member_id('member_b'), 'cancelled'),
  ('e7000000-0000-4000-8000-000000000002', tests.member_id('member_a'), 'going'),
  ('e7000000-0000-4000-8000-000000000003', tests.member_id('member_a'), 'going'),
  ('e7000000-0000-4000-8000-000000000004', tests.member_id('member_a'), 'going');

create function pg_temp.ev(nn text) returns uuid language sql as $$ select ('e7000000-0000-4000-8000-0000000000' || nn)::uuid $$;
create function pg_temp.notes(kind text, ev text) returns integer language sql as
  $$ select count(*)::integer from public.notifications where kind = notes.kind and data ->> 'event_id' = pg_temp.ev(ev)::text $$;

-- ---------------------------------------------------------------------------
-- Who may call it
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.send_event_reminders('24h') $$, '42501', null, 'anon cannot send reminders');
select tests.authenticate_as('national_president');
select throws_ok($$ select public.send_event_reminders('24h') $$, '42501', null, 'an officer cannot send reminders');
select throws_ok($$ select count(*) from public.event_reminders_sent $$, '42501', null, 'clients cannot read the reminder ledger');
select tests.clear_auth();
select throws_ok($$ select public.send_event_reminders('1w') $$, '22023', null, 'an unknown reminder kind is refused');

-- ---------------------------------------------------------------------------
-- 24 h reminder
-- ---------------------------------------------------------------------------
select is(public.send_event_reminders('24h'), 2, 'the 24 h run reminds the two going registrants of the day-ahead event');
select is(pg_temp.notes('event.reminder_24h', '01'), 2, 'two 24 h reminders for the day-ahead event');
select is(pg_temp.notes('event.reminder_24h', '02'), 0, 'an event more than 24 h away gets none');
select is(pg_temp.notes('event.reminder_24h', '03'), 0, 'an event within 2 h gets the 2 h reminder, not this one');
select is(pg_temp.notes('event.reminder_24h', '04'), 0, 'a draft event gets none');
select is((select count(*)::int from public.notifications where kind = 'event.reminder_24h' and member_id in (tests.member_id('guardian'), tests.member_id('member_b'))), 0,
  'waitlisted and cancelled registrants get none');
select is((select priority from public.notifications where kind = 'event.reminder_24h' limit 1), 'normal', 'the 24 h reminder is normal priority');
select ok((select bool_and(body !~ '[0-9]{8,}' and title !~ '[0-9]{8,}') from public.notifications where kind like 'event.reminder_%'),
  'reminder text carries no phone-like numbers');
select is(public.send_event_reminders('24h'), 0, 'running the 24 h job again sends nothing');
select is(pg_temp.notes('event.reminder_24h', '01'), 2, 'still two 24 h reminders after the second run');

insert into public.rsvps (event_id, member_id, status) values (pg_temp.ev('01'), tests.member_id('turns_35'), 'going');
select is(public.send_event_reminders('24h'), 1, 'a late registrant is reminded on the next run');
select is(public.send_event_reminders('24h'), 0, 'and only once');

-- ---------------------------------------------------------------------------
-- 2 h reminder (high priority)
-- ---------------------------------------------------------------------------
select is(public.send_event_reminders('2h'), 1, 'the 2 h run reminds the registrant of the event starting within 2 h');
select is((select priority from public.notifications where kind = 'event.reminder_2h'), 'high', 'the 2 h reminder is high priority');
select is(public.send_event_reminders('2h'), 0, 'the 2 h job is idempotent too');
update public.events set starts_at = now() + interval '1 hour', ends_at = now() + interval '3 hours' where id = pg_temp.ev('01');
select is(public.send_event_reminders('2h'), 3, 'an event moved inside 2 h now gets its 2 h reminders (separate ledger kind)');
select is(public.send_event_reminders('24h'), 0, 'and no repeat 24 h reminder');
select is((select count(*)::int from public.audit_log where action = 'event.reminders_sent'), 4, 'each run that sent something is audited');

-- A reschedule clears the ledger: the event is a new occasion and is reminded again.
update public.events set starts_at = now() + interval '20 hours', ends_at = now() + interval '22 hours' where id = pg_temp.ev('02');
select is(public.send_event_reminders('24h'), 1, 'an event moved into the 24 h window is reminded');
select is(public.send_event_reminders('24h'), 0, 'and only once');
update public.events set starts_at = now() + interval '21 hours', ends_at = now() + interval '23 hours' where id = pg_temp.ev('02');
select is(public.send_event_reminders('24h'), 1, 'rescheduled after its reminder went out: reminded again');
update public.events set title = 'P1-07a far away renamed' where id = pg_temp.ev('02');
select is(public.send_event_reminders('24h'), 0, 'editing something other than the start time does not reset the ledger');

-- ---------------------------------------------------------------------------
-- Cancellation: going and waitlisted registrants are told, high priority, once
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bp_a');
select lives_ok($$ update public.events set status = 'cancelled' where id = pg_temp.ev('01') $$, 'a branch officer cancels the event');
select tests.clear_auth();
select is(pg_temp.notes('event.cancelled', '01'), 4, 'going (3) and waitlisted (1) registrants are told; the cancelled one is not');
select is((select priority from public.notifications where kind = 'event.cancelled' limit 1), 'high', 'the cancellation is high priority');
select is((select count(*)::int from public.notifications where kind = 'event.cancelled' and member_id = tests.member_id('member_b')), 0, 'a registrant who cancelled is not told');
update public.events set title = 'P1-07a day-ahead renamed' where id = pg_temp.ev('01');
select is(pg_temp.notes('event.cancelled', '01'), 4, 'editing a cancelled event does not notify again');
select is(public.send_event_reminders('2h'), 0, 'a cancelled event gets no reminders');

-- ---------------------------------------------------------------------------
-- Waitlist promotion: the promoted member is told
-- ---------------------------------------------------------------------------
select tests.authenticate_as('guardian');
select is(public.rsvp(pg_temp.ev('05'), tests.member_id('guardian'), 'going'), 'going', 'the guardian takes the only place');
select tests.authenticate_as('member_a');
select is(public.rsvp(pg_temp.ev('05'), tests.member_id('member_a'), 'going'), 'waitlisted', 'a second registrant is waitlisted');
select tests.clear_auth();
select is(pg_temp.notes('event.waitlist_promoted', '05'), 0, 'joining the waitlist notifies nobody');
select tests.authenticate_as('guardian');
select is(public.rsvp(pg_temp.ev('05'), tests.member_id('guardian'), 'cancelled'), 'cancelled', 'the guardian cancels');
select tests.clear_auth();
select is(pg_temp.notes('event.waitlist_promoted', '05'), 1, 'the promoted member gets one notification');
select is((select member_id from public.notifications where kind = 'event.waitlist_promoted'), tests.member_id('member_a'), 'it goes to the promoted member');
select is((select priority from public.notifications where kind = 'event.waitlist_promoted'), 'normal', 'normal priority when the event is more than a day away');

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------
select tests.authenticate_as('member_a');
select is((select going from public.event_spots(array[pg_temp.ev('05')])), 1, 'a member sees how many places are taken');
select is_empty($$ select * from public.event_spots(array[pg_temp.ev('04')]) $$, 'a draft event has no spots row for a member');
select tests.authenticate_as('member_b');
select is_empty($$ select * from public.event_spots(array[pg_temp.ev('05')]) $$, 'a branch B member gets nothing for a branch A event');
select throws_ok($$ select * from public.event_attendees(pg_temp.ev('05')) $$, '42501', null, 'a member cannot list attendees');
select tests.authenticate_as('bp_b');
select throws_ok($$ select * from public.event_attendees(pg_temp.ev('05')) $$, '42501', null, 'another branch''s officer cannot list attendees');
select tests.authenticate_as('bp_a');
select is((select count(*)::int from public.event_attendees(pg_temp.ev('05'))), 2, 'the event''s officer lists attendees (one going, one cancelled)');
select is((select count(*)::int from public.event_attendees(pg_temp.ev('05')) where status = 'going' and full_name is not null), 1, 'with names and statuses');
select lives_ok($$ select public.set_event_staff(pg_temp.ev('05'), tests.member_id('member_b'), array['check_in']) $$, 'a branch B member is added to the team');
select is((select count(*)::int from public.event_team(pg_temp.ev('05'))), 1, 'the officer reads the event team');
select tests.authenticate_as('member_a');
select throws_ok($$ select * from public.event_team(pg_temp.ev('05')) $$, '42501', null, 'a member cannot read the team');
select tests.authenticate_as('member_b');
select is((select count(*)::int from public.my_event_duties() where event_id = pg_temp.ev('05')), 1, 'the staff member sees the other branch''s event under "my event duties"');
select is_empty($$ select * from public.my_event_duties() where event_id = pg_temp.ev('02') $$, 'and not events they are not staff for');

select throws_ok($$ select * from public.event_spots(array(select gen_random_uuid() from generate_series(1, 201))) $$, '54000', null,
  'more than 200 event ids is refused, not silently truncated');
select lives_ok($$ select * from public.event_spots(array(select gen_random_uuid() from generate_series(1, 200))) $$, '200 ids is fine');

select tests.clear_auth();
select ok(exists (select 1 from cron.job where jobname = 'event-reminders-hourly' and schedule = '5 * * * *'), 'the hourly job is scheduled');
select lives_ok($$ select public.wake_event_reminders() $$, 'waking with no URL or secret configured does not raise');

-- Only https (or the local stack) ever receives the secret.
insert into public.app_settings (key, value, description) values
  ('event_reminders_url', '"http://example.com/functions/v1/event-reminders"'::jsonb, 'test'),
  ('event_reminders_secret', '"test-secret"'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;
create temp table q_before as select count(*) as n from net.http_request_queue;
select lives_ok($$ select public.wake_event_reminders() $$, 'a non-https URL does not raise');
select is((select count(*) from net.http_request_queue) - (select n from q_before), 0::bigint, 'nothing is queued for a non-https URL');
update public.app_settings set value = '"https://example.com/functions/v1/event-reminders"'::jsonb where key = 'event_reminders_url';
select public.wake_event_reminders();
select is((select count(*) from net.http_request_queue) - (select n from q_before), 1::bigint, 'an https URL queues one request');

select * from finish();
rollback;

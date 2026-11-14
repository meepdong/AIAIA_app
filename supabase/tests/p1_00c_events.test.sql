-- P1-00c rsvp, the event team (set/remove_event_staff, is_event_staff), event_pack and
-- sync_check_ins. People: seeds/p0-02.sql. Seeded events (seeds/p1-00a.sql): 02 branch A youth,
-- 05 A draft, 06 A hidden, 01 national youth. This file adds a1 (A, all, capacity 1, running now),
-- a2 (A, registration closed), a3 (B, running now) and a4 (A, removed).
begin;
select plan(85);

insert into public.events
  (id, scope, branch_id, audience, title, starts_at, ends_at, capacity, status, created_by,
   registration_opens_at, registration_closes_at, removed_at)
values
  ('e0000000-0000-4000-8000-0000000000a1', 'branch', tests.branch_id('A'), 'all', 'P1-00c capacity one',
   now() - interval '1 hour', now() + interval '3 hours', 1, 'published', tests.member_id('national_president'), null, null, null),
  ('e0000000-0000-4000-8000-0000000000a2', 'branch', tests.branch_id('A'), 'youth', 'P1-00c closed registration',
   now() + interval '1 day', now() + interval '26 hours', null, 'published', tests.member_id('national_president'),
   now() - interval '2 days', now() - interval '1 day', null),
  ('e0000000-0000-4000-8000-0000000000a3', 'branch', tests.branch_id('B'), 'all', 'P1-00c branch B',
   now() - interval '1 hour', now() + interval '3 hours', null, 'published', tests.member_id('national_president'), null, null, null),
  ('e0000000-0000-4000-8000-0000000000a4', 'branch', tests.branch_id('A'), 'all', 'P1-00c removed',
   now() - interval '1 hour', now() + interval '3 hours', null, 'published', tests.member_id('national_president'), null, null, now()),
  ('e0000000-0000-4000-8000-0000000000a5', 'national', null, 'all', 'P1-00c national running',
   now() - interval '1 hour', now() + interval '3 hours', null, 'published', tests.member_id('national_president'), null, null, null),
  ('e0000000-0000-4000-8000-0000000000a6', 'branch', tests.branch_id('A'), 'all', 'P1-00c ended long ago',
   now() - interval '3 days', now() - interval '2 days', null, 'published', tests.member_id('national_president'), null, null, null);
update public.members set pass_version = 3 where id in (tests.member_id('member_a'), tests.member_id('guardian'));
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
  where member_id = tests.member_id('turns_18') and guardian_member_id = tests.member_id('guardian');

create function pg_temp.ev(nn text) returns uuid language sql as
  $$ select ('e0000000-0000-4000-8000-0000000000' || nn)::uuid $$;
create function pg_temp.ref(nn text) returns uuid language sql as
  $$ select ('5c000000-0000-4000-8000-0000000000' || nn)::uuid $$;
create function pg_temp.rsvp_of(ev text, who text) returns text language sql as
  $$ select status from public.rsvps where event_id = pg_temp.ev(ev) and member_id = tests.member_id(who) $$;

-- Sync payloads (built as owner, so no test reads members as a client) and results.
create table tests.p1c_sync (k text primary key, payload jsonb, result jsonb);
grant select, update on tests.p1c_sync to authenticated;
create function pg_temp.scan(nn text, who text, pv int, ago interval, walk boolean default false) returns jsonb
  language sql as $$ select jsonb_build_object('client_ref', pg_temp.ref(nn), 'member_id', tests.member_id(who),
    'pass_version', pv, 'scanned_at', now() - ago, 'walk_in', walk) $$;
insert into tests.p1c_sync (k, payload) values
  ('b1', jsonb_build_array(
    pg_temp.scan('01', 'member_a', 3, '30 minutes'),
    pg_temp.scan('02', 'minor_16', 1, '20 minutes'),
    pg_temp.scan('03', 'guardian', 2, '25 minutes'),
    pg_temp.scan('04', 'suspended', 1, '25 minutes'),
    jsonb_build_object('client_ref', 'not-a-uuid', 'member_id', tests.member_id('member_b'), 'pass_version', 1),
    pg_temp.scan('06', 'support_staff', 1, '15 minutes', true),
    pg_temp.scan('09', 'dependent_9', 1, '-1 hour'))),
  ('b1_again', null),
  ('b2', jsonb_build_array(pg_temp.scan('07', 'member_a', 3, '50 minutes'), pg_temp.scan('08', 'member_a', 3, '10 minutes'))),
  ('b3', jsonb_build_array(pg_temp.scan('02', 'member_a', 3, '5 minutes'))),
  ('b4', jsonb_build_array(pg_temp.scan('0a', 'member_b', 1, '5 minutes', true))),
  ('b5', jsonb_build_array(pg_temp.scan('0b', 'member_b', 1, '5 minutes', true)));
create function pg_temp.sync(k text, ev text, store text) returns void language sql as
  $$ update tests.p1c_sync set result = public.sync_check_ins(pg_temp.ev(ev), (select payload from tests.p1c_sync where k = sync.k))
     where k = store $$;
create function pg_temp.res(k text) returns jsonb language sql as $$ select result from tests.p1c_sync where k = res.k $$;

-- ---------------------------------------------------------------------------
-- rsvp
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('member_a'), 'going') $$, '42501', null, 'anon cannot RSVP');
select tests.authenticate_as('pending');
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('pending'), 'going') $$, '42501', null, 'a pending applicant cannot RSVP');
select tests.authenticate_as('suspended');
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('suspended'), 'going') $$, '42501', null, 'a suspended member cannot RSVP');

select tests.authenticate_as('guardian');
select is(public.rsvp(pg_temp.ev('a1'), tests.member_id('dependent_9'), 'going'), 'going', 'a guardian can RSVP for their dependent');
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('turns_18'), 'going') $$, '42501', null,
  'a guardian whose link has ended cannot RSVP for the former ward');
select tests.authenticate_as('member_a');
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('minor_16'), 'going') $$, '42501', null,
  'another member cannot RSVP for someone else');
select is(public.rsvp(pg_temp.ev('a1'), tests.member_id('member_a'), 'going'), 'waitlisted', 'capacity overflow goes to the waitlist');
select is(public.rsvp(pg_temp.ev('a1'), tests.member_id('member_a'), 'going'), 'waitlisted', 'asking again does not jump the waitlist');
select throws_ok($$ select public.rsvp(pg_temp.ev('a2'), tests.member_id('member_a'), 'going') $$, '22023', null, 'a closed registration window refuses');
select throws_ok($$ select public.rsvp(pg_temp.ev('05'), tests.member_id('member_a'), 'going') $$, '42501', null, 'a draft event refuses');
select throws_ok($$ select public.rsvp(pg_temp.ev('06'), tests.member_id('member_a'), 'going') $$, '42501', null, 'a hidden event refuses');
select throws_ok($$ select public.rsvp(pg_temp.ev('a4'), tests.member_id('member_a'), 'going') $$, '42501', null, 'a removed event refuses');
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('member_a'), 'waitlisted') $$, '22023', null, 'status must be going or cancelled');
select throws_ok($$ insert into public.rsvps (event_id, member_id) values (pg_temp.ev('02'), tests.member_id('member_a')) $$,
  '42501', null, 'clients cannot write rsvps directly');
select tests.authenticate_as('member_b');
select throws_ok($$ select public.rsvp(pg_temp.ev('02'), tests.member_id('member_b'), 'going') $$, '42501', null,
  'a branch B member cannot RSVP for a branch A event');
select tests.authenticate_as('guardian');
select is(public.rsvp(pg_temp.ev('a1'), tests.member_id('dependent_9'), 'cancelled'), 'cancelled', 'a guardian can cancel for their dependent');
select tests.clear_auth();
select is(pg_temp.rsvp_of('a1', 'member_a'), 'going', 'a cancellation promotes the waitlisted member');
select is((select created_by from public.rsvps where event_id = pg_temp.ev('a1') and member_id = tests.member_id('dependent_9')),
  tests.member_id('guardian'), 'the guardian is recorded as the RSVP author');
select is_empty($$ select 1 from public.rsvps where member_id in (tests.member_id('minor_16'), tests.member_id('turns_18')) $$,
  'the refused RSVPs wrote nothing');
select ok(exists (select 1 from public.audit_log where action = 'event.rsvp' and details ->> 'by_guardian' = 'true'), 'RSVPs are audited');

-- ---------------------------------------------------------------------------
-- set_event_staff, remove_event_staff, is_event_staff
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_b'), array['check_in']) $$, '42501', null, 'anon cannot staff an event');
select throws_ok($$ select public.is_event_staff(pg_temp.ev('a1'), 'check_in') $$, '42501', null, 'anon cannot call is_event_staff');
select tests.authenticate_as('member_a');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_b'), array['check_in']) $$, '42501', null, 'a member cannot staff an event');
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_b'), array['check_in']) $$, '42501', null, 'a branch B officer cannot staff a branch A event');
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_b'), array['check_in']) $$, '42501', null, 'the enforcement committee cannot staff an event');
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_b'), array['check_in']) $$, '42501', null, 'a super admin without a step-up cannot staff an event');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('01'), tests.member_id('member_b'), array['check_in']) $$, '42501', null, 'a branch officer cannot staff a national event');
select lives_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_b'), array['check_in']) $$, 'a branch A officer can staff a branch A event with a branch B member');
select lives_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_a'), array['safety_lead', 'safety_lead']) $$, 'capabilities may repeat');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_a'), array['admin']) $$, '22023', null, 'an unknown capability is rejected');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('member_a'), array[]::text[]) $$, '22023', null, 'an empty capability list is rejected');
select throws_ok($$ select public.set_event_staff(pg_temp.ev('a1'), tests.member_id('suspended'), array['check_in']) $$, '22023', null, 'staff must be active');
select tests.authenticate_as('national_president');
select lives_ok($$ select public.set_event_staff(pg_temp.ev('01'), tests.member_id('enforcement'), array['check_in']) $$, 'a national officer can staff a national event');
select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select lives_ok($$ select public.set_event_staff(pg_temp.ev('a3'), tests.member_id('bp_b'), array['collect_payments']) $$, 'a super admin with a step-up can staff an event');
select tests.clear_auth();
select is((select capabilities from public.event_staff where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_b')),
  array['check_in'], 'the staff row holds the capabilities');
select is((select capabilities from public.event_staff where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_a')),
  array['safety_lead'], 'repeated capabilities are stored once');
select is((select added_by from public.event_staff where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_b')),
  tests.member_id('bp_a'), 'the officer is recorded as adding the staff member');

select tests.authenticate_as('member_b');
select ok(public.is_event_staff(pg_temp.ev('a1'), 'check_in'), 'listed staff hold their capability');
select ok(not public.is_event_staff(pg_temp.ev('a1'), 'safety_lead'), 'listed staff do not hold other capabilities');
select ok(not public.is_event_staff(pg_temp.ev('a3'), 'check_in'), 'staff of one event are not staff of another');
select tests.authenticate_as('member_a');
select ok(not public.is_event_staff(pg_temp.ev('a1'), 'check_in'), 'a safety lead does not hold check_in');
select tests.authenticate_as('bp_a');
select ok(public.is_event_staff(pg_temp.ev('a1'), 'check_in'), 'the scope officer counts as staff');
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.remove_event_staff(pg_temp.ev('a1'), tests.member_id('member_a')) $$, '42501', null, 'a branch B officer cannot remove branch A event staff');
select tests.clear_auth();
select isnt_empty($$ select 1 from public.event_staff where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_a') $$,
  'the refused removal changed nothing');
select tests.authenticate_as('bp_a');
select ok(public.remove_event_staff(pg_temp.ev('a1'), tests.member_id('member_a')), 'the scope officer can remove staff');
select ok(not public.remove_event_staff(pg_temp.ev('a1'), tests.member_id('member_a')), 'removing again reports nothing removed');
select tests.clear_auth();
select ok(exists (select 1 from public.audit_log where action = 'event.staff_set') and exists (select 1 from public.audit_log where action = 'event.staff_remove'),
  'team changes are audited');

-- ---------------------------------------------------------------------------
-- event_pack
-- ---------------------------------------------------------------------------
update public.events set capacity = null where id = pg_temp.ev('a1');
select tests.authenticate_as('minor_16');
select is(public.rsvp(pg_temp.ev('a1'), tests.member_id('minor_16'), 'going'), 'going', 'a member can RSVP for themself');
select tests.authenticate_as('guardian');
select is(public.rsvp(pg_temp.ev('a1'), tests.member_id('dependent_9'), 'going'), 'going', 'a cancelled RSVP can go again');

select tests.authenticate_as('member_b');
select is((select array_agg(age_group order by member_id) from public.event_pack(pg_temp.ev('a1'))),
  array['adult', '14-17', 'under-14'], 'the pack lists the going registrants with their age groups');
select is((select guardian_names from public.event_pack(pg_temp.ev('a1')) where member_id = tests.member_id('dependent_9')),
  array['Vikram Fixture'], 'the pack names a ward''s active guardians');
select is((select pass_version from public.event_pack(pg_temp.ev('a1')) where member_id = tests.member_id('member_a')), 3, 'the pack carries the current pass_version');
select is((select branch_name from public.event_pack(pg_temp.ev('a1')) where member_id = tests.member_id('member_a')),
  (select name from public.branches where id = tests.branch_id('A')), 'the pack carries the home branch');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a3')) $$, '42501', null, 'staff of one event cannot pack another');
select tests.authenticate_as('member_a');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a1')) $$, '42501', null, 'a member who is not check-in staff cannot pack');
select tests.authenticate_as('bp_b');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a1')) $$, '42501', null, 'a branch B officer cannot pack a branch A event');
select tests.authenticate_as('enforcement');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a1')) $$, '42501', null, 'check-in staff of a national event cannot pack a branch event');
select tests.as_anon();
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a1')) $$, '42501', null, 'anon cannot pack');
select tests.authenticate_as('bp_a');
select is((select count(*)::int from public.event_pack(pg_temp.ev('a1'))), 3, 'the scope officer can pack');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('06')) $$, '22023', null, 'a hidden event has no pack');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a4')) $$, '22023', null, 'a removed event has no pack');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('05')) $$, '22023', null, 'a draft event has no pack');

-- ---------------------------------------------------------------------------
-- sync_check_ins
-- ---------------------------------------------------------------------------
select tests.authenticate_as('member_b');
select pg_temp.sync('b1', 'a1', 'b1');
select tests.clear_auth();
select is(pg_temp.res('b1') -> 'accepted', jsonb_build_array(pg_temp.ref('01'), pg_temp.ref('02'), pg_temp.ref('06')),
  'valid scans, including a walk-in, are accepted');
select ok(pg_temp.res('b1') -> 'rejected' @> jsonb_build_array(jsonb_build_object('client_ref', pg_temp.ref('03'), 'reason', 'stale_pass')),
  'a stale pass_version is rejected');
select is_empty($$ select 1 from public.check_ins where member_id = tests.member_id('guardian') $$, 'the stale pass was not checked in');
select is(pg_temp.res('b1') -> 'rejected', jsonb_build_array(
    jsonb_build_object('client_ref', pg_temp.ref('03'), 'reason', 'stale_pass'),
    jsonb_build_object('client_ref', pg_temp.ref('04'), 'reason', 'member_not_active'),
    jsonb_build_object('client_ref', 'not-a-uuid', 'reason', 'invalid_row'),
    jsonb_build_object('client_ref', pg_temp.ref('09'), 'reason', 'invalid_scanned_at')),
  'inactive members, malformed rows and future scans are rejected');
select is((select array_agg(walk_in order by member_id) from public.check_ins where event_id = pg_temp.ev('a1')),
  array[true, false, false], 'a scan without a going RSVP is stored as a walk-in');
select is((select count(*)::int from public.check_ins where event_id = pg_temp.ev('a1') and source = 'offline_sync'
  and checked_in_by = tests.member_id('member_b')), 3, 'synced rows record the source and the scanner');

select tests.authenticate_as('member_b');
select pg_temp.sync('b1', 'a1', 'b1_again');
select tests.clear_auth();
select is(pg_temp.res('b1_again'), pg_temp.res('b1'), 'syncing the same client_refs twice gives the same answer');
select is((select count(*)::int from public.check_ins where event_id = pg_temp.ev('a1')), 3, 'syncing twice adds no rows');

select tests.authenticate_as('member_b');
select pg_temp.sync('b2', 'a1', 'b2');
select pg_temp.sync('b1', 'a1', 'b1_again');
select pg_temp.sync('b3', 'a1', 'b3');
select tests.clear_auth();
select is((select checked_in_at from public.check_ins where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_a')),
  now() - interval '50 minutes', 'the earliest scan wins');
select is((select client_ref from public.check_ins where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_a')),
  pg_temp.ref('07'), 'the row keeps the earliest scan''s client_ref, even after replays');
select ok(pg_temp.res('b1_again') -> 'accepted' @> jsonb_build_array(pg_temp.ref('01')), 'a replayed, superseded client_ref is still accepted');
select is(pg_temp.res('b3') -> 'rejected', jsonb_build_array(jsonb_build_object('client_ref', pg_temp.ref('02'), 'reason', 'client_ref_conflict')),
  'a client_ref already used for another member is rejected');

select tests.authenticate_as('member_b');
select throws_ok($$ select public.sync_check_ins(pg_temp.ev('a3'), (select payload from tests.p1c_sync where k = 'b2')) $$, '42501', null,
  'staff of event X cannot sync check-ins for event Y');
select throws_ok($$ select public.sync_check_ins(pg_temp.ev('a1'), '{}'::jsonb) $$, '22023', null, 'rows must be an array');
select tests.authenticate_as('member_a');
select throws_ok($$ select public.sync_check_ins(pg_temp.ev('a1'), '[]'::jsonb) $$, '42501', null, 'a member who is not staff cannot sync');
select tests.authenticate_as('pending');
select throws_ok($$ select public.sync_check_ins(pg_temp.ev('a1'), '[]'::jsonb) $$, '42501', null, 'a pending applicant cannot sync');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.sync_check_ins(pg_temp.ev('06'), '[]'::jsonb) $$, '22023', null, 'a hidden event takes no check-ins');
select tests.authenticate_as('member_a');
select is((select count(*)::int from public.check_ins where event_id = pg_temp.ev('a1')), 1, 'a member sees only their own check-in');
select tests.clear_auth();
select ok(exists (select 1 from public.audit_log where action = 'event.check_in_sync'), 'syncs are audited');

-- A walk-in at a branch event must belong to that branch; national events take anyone
select tests.authenticate_as('member_b');
select pg_temp.sync('b4', 'a1', 'b4');
select tests.clear_auth();
select is(pg_temp.res('b4') -> 'rejected', jsonb_build_array(jsonb_build_object('client_ref', pg_temp.ref('0a'), 'reason', 'out_of_scope')),
  'a walk-in from another branch is rejected at a branch event');
select is_empty($$ select 1 from public.check_ins where event_id = pg_temp.ev('a1') and member_id = tests.member_id('member_b') $$,
  'the out-of-scope walk-in was not stored');
select tests.authenticate_as('national_president');
select pg_temp.sync('b5', 'a5', 'b5');
select tests.clear_auth();
select is(pg_temp.res('b5') -> 'accepted', jsonb_build_array(pg_temp.ref('0b')), 'a walk-in from any branch is accepted at a national event');

-- The pack is not served long after the event
select tests.authenticate_as('bp_a');
select throws_ok($$ select * from public.event_pack(pg_temp.ev('a6')) $$, '42501', null, 'no pack for an event that ended more than a day ago');
select tests.clear_auth();

select * from finish();
rollback;

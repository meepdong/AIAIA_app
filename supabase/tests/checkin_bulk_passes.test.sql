-- P1-07b: bulk_passes() (who may print a sheet of signed passes, and whose passes are on it).
-- People: seeds/p0-02.sql (bp_a/bp_b branch presidents of A/B, national_president, mentor,
-- super_admin, enforcement; suspended and pending in branch A). tests.grant_step_up: seeds/p1-00a.sql.
-- This file adds events 7b1 (branch A) and 7b2 (branch A), and bulk members a7b00000-... for the cap.
begin;
select plan(37);

insert into public.events (id, scope, branch_id, audience, title, starts_at, ends_at, status, created_by) values
  ('e0000000-0000-4000-8000-0000000007b1', 'branch', tests.branch_id('A'), 'all', 'P1-07b bulk print',
   now() + interval '2 days', now() + interval '50 hours', 'published', tests.member_id('national_president')),
  ('e0000000-0000-4000-8000-0000000007b2', 'branch', tests.branch_id('A'), 'all', 'P1-07b other event',
   now() + interval '3 days', now() + interval '74 hours', 'published', tests.member_id('national_president'));

create function pg_temp.ev(nn text) returns uuid language sql as
  $$ select ('e0000000-0000-4000-8000-0000000007' || nn)::uuid $$;

insert into public.rsvps (event_id, member_id, status) values
  (pg_temp.ev('b1'), tests.member_id('member_a'), 'going'),
  (pg_temp.ev('b1'), tests.member_id('dependent_9'), 'going'),
  (pg_temp.ev('b1'), tests.member_id('turns_18'), 'going'),
  (pg_temp.ev('b1'), tests.member_id('suspended'), 'going'),
  (pg_temp.ev('b1'), tests.member_id('turns_35'), 'waitlisted'),
  (pg_temp.ev('b1'), tests.member_id('guardian'), 'cancelled'),
  (pg_temp.ev('b2'), tests.member_id('minor_16'), 'going');
-- member_b is listed check-in staff of 7b1, not one of its officers.
insert into public.event_staff (event_id, member_id, capabilities, added_by) values
  (pg_temp.ev('b1'), tests.member_id('member_b'), array['check_in'], tests.member_id('bp_a'));

-- Expected rows, worked out as owner.
create temp table t_active as select id, branch_id from public.members where status = 'active';
grant select on t_active to authenticated;

create function pg_temp.audits() returns bigint language sql as
  $$ select count(*) from public.audit_log where action = 'member.passes_bulk' $$;

-- ===== execute privileges ===================================================
select ok(not has_function_privilege('anon', 'public.bulk_passes(uuid, uuid)', 'execute'),
  'anon cannot execute bulk_passes');
select ok(has_function_privilege('authenticated', 'public.bulk_passes(uuid, uuid)', 'execute'),
  'authenticated may execute bulk_passes');
select tests.as_anon();
select throws_ok($$ select * from public.bulk_passes(branch_id => tests.branch_id('A')) $$, '42501', null,
  'an anon call is refused');
select tests.clear_auth();

-- ===== arguments ============================================================
select tests.authenticate_as('bp_a');
select throws_ok($$ select * from public.bulk_passes() $$, '22023', null, 'no scope is rejected');
select throws_ok(format('select * from public.bulk_passes(%L, %L)', tests.branch_id('A'), pg_temp.ev('b1')),
  '22023', null, 'two scopes at once are rejected');

-- ===== branch scope: refused ================================================
create function pg_temp.branch_refused(who text, branch text) returns text language plpgsql as $$
begin
  perform tests.authenticate_as(who);
  return throws_ok(format('select * from public.bulk_passes(branch_id => %L)', tests.branch_id(branch)),
    '42501', null, who || ' cannot print branch ' || branch || ' passes');
end $$;
select pg_temp.branch_refused('member_a', 'A');
select pg_temp.branch_refused('pending', 'A');
select pg_temp.branch_refused('bp_b', 'A');
select pg_temp.branch_refused('bp_a', 'B');
select pg_temp.branch_refused('enforcement', 'A');
select pg_temp.branch_refused('guardian', 'A');
select pg_temp.branch_refused('super_admin', 'A');

-- ===== event scope: refused =================================================
create function pg_temp.event_refused(who text, ev uuid, why text) returns text language plpgsql as $$
begin
  perform tests.authenticate_as(who);
  return throws_ok(format('select * from public.bulk_passes(event_id => %L)', ev),
    '42501', null, who || ' cannot print event passes (' || why || ')');
end $$;
select pg_temp.event_refused('member_a', pg_temp.ev('b1'), 'a registrant');
select pg_temp.event_refused('pending', pg_temp.ev('b1'), 'pending');
select pg_temp.event_refused('bp_b', pg_temp.ev('b1'), 'officer of another branch');
select pg_temp.event_refused('member_b', pg_temp.ev('b1'), 'listed check-in staff only');
select pg_temp.event_refused('super_admin', pg_temp.ev('b1'), 'no step-up');
select pg_temp.event_refused('bp_a', 'e0000000-0000-4000-8000-0000000007ff', 'unknown event');

select tests.clear_auth();
select is(pg_temp.audits(), 0::bigint, 'refused calls write no audit row');

-- ===== branch scope: allowed ================================================
select tests.authenticate_as('bp_a');
select set_eq($$ select member_id from public.bulk_passes(branch_id => tests.branch_id('A')) $$,
  $$ select id from t_active where branch_id = tests.branch_id('A') $$,
  'branch A officer gets exactly the active branch A members');
select ok(not exists (select 1 from public.bulk_passes(branch_id => tests.branch_id('A'))
  where member_id in (tests.member_id('suspended'), tests.member_id('pending'))),
  'suspended and pending members are not on the sheet');
select is((select branch_name from public.bulk_passes(branch_id => tests.branch_id('A')) limit 1),
  (select name from public.branches where id = tests.branch_id('A')), 'rows carry the branch name');

select tests.clear_auth();
select is(pg_temp.audits(), 3::bigint, 'one audit row per batch');
select is((select details from public.audit_log where action = 'member.passes_bulk' order by id limit 1),
  jsonb_build_object('scope', 'branch', 'count', (select count(*) from t_active where branch_id = tests.branch_id('A'))),
  'the audit row records the scope and the count');
select is((select entity || ':' || entity_id from public.audit_log where action = 'member.passes_bulk' order by id limit 1),
  'branches:' || tests.branch_id('A'), 'the audit row names the branch');
select is((select actor_member_id from public.audit_log where action = 'member.passes_bulk' order by id limit 1),
  tests.member_id('bp_a'), 'the audit row names the officer');

select tests.authenticate_as('national_president');
select set_eq($$ select member_id from public.bulk_passes(branch_id => tests.branch_id('B')) $$,
  $$ select id from t_active where branch_id = tests.branch_id('B') $$, 'a national officer prints any branch');
select tests.authenticate_as('mentor');
select set_eq($$ select member_id from public.bulk_passes(branch_id => tests.branch_id('A')) $$,
  $$ select id from t_active where branch_id = tests.branch_id('A') $$, 'the mentor prints');
select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select set_eq($$ select member_id from public.bulk_passes(branch_id => tests.branch_id('A')) $$,
  $$ select id from t_active where branch_id = tests.branch_id('A') $$, 'a super admin with a step-up prints');

-- ===== event scope: allowed =================================================
select tests.authenticate_as('bp_a');
select set_eq(format('select member_id from public.bulk_passes(event_id => %L)', pg_temp.ev('b1')),
  format('values (%L::uuid), (%L::uuid), (%L::uuid)',
    tests.member_id('member_a'), tests.member_id('dependent_9'), tests.member_id('turns_18')),
  'the event officer gets exactly the active going registrants of that event');
select ok(not exists (select 1 from public.bulk_passes(event_id => pg_temp.ev('b1'))
  where member_id = tests.member_id('suspended')), 'a suspended registrant is not on the sheet');
select ok(not exists (select 1 from public.bulk_passes(event_id => pg_temp.ev('b1'))
  where member_id = tests.member_id('minor_16')), 'another event''s registrant is not on the sheet');
select tests.clear_auth();
select is((select details from public.audit_log where action = 'member.passes_bulk' and entity = 'events' order by id limit 1),
  '{"scope": "event", "count": 3}'::jsonb, 'the event batch is audited with its count');
select tests.authenticate_as('super_admin');
select is((select count(*) from public.bulk_passes(event_id => pg_temp.ev('b2'))), 1::bigint,
  'a super admin with a step-up prints an event');

-- ===== the cap ==============================================================
-- Fill branch A to exactly 500 active members: allowed. One more: 54000, no rows, no audit row.
select tests.clear_auth();
insert into public.members (id, full_name, branch_id, wing, status)
select ('a7b00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'Kabir Fixture', tests.branch_id('A'), 'youth', 'active'
from generate_series(1, 500 - (select count(*) from t_active where branch_id = tests.branch_id('A'))::int) g;
select tests.authenticate_as('bp_a');
select is((select count(*) from public.bulk_passes(branch_id => tests.branch_id('A'))), 500::bigint,
  '500 passes is allowed');
select tests.clear_auth();
insert into public.members (id, full_name, branch_id, wing, status)
values ('a7b00000-0000-4000-8000-000000000999', 'Kabir Fixture', tests.branch_id('A'), 'youth', 'active');
create temp table t_audits as select pg_temp.audits() as n;
select tests.authenticate_as('bp_a');
select throws_ok($$ select * from public.bulk_passes(branch_id => tests.branch_id('A')) $$, '54000', null,
  '501 passes raises 54000');
select tests.clear_auth();
select is(pg_temp.audits(), (select n from t_audits), 'a refused oversized batch writes no audit row');

select * from finish();
rollback;

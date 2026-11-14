-- P1-00a announcements, events and rsvps visibility and writes. Fixture content (seeds/p1-00a.sql), by id suffix:
--   1 national youth, 2 branch A youth, 3 branch B youth, 4 national aiaia, 5 branch A draft,
--   6 branch A hidden, 7 national hidden, 8 national 'all', 9 branch A scheduled (announcement only).
-- People (seeds/p0-02.sql): member_a, bp_a, national_president, super_admin are youth in A; member_b,
-- bp_b, enforcement are youth in B; guardian and mentor are aiaia in A.
begin;
select plan(64);

create function pg_temp.ev() returns int[] language sql as
  $$ select coalesce(array_agg(right(id::text, 2)::int order by 1), '{}') from public.events $$;
create function pg_temp.an() returns int[] language sql as
  $$ select coalesce(array_agg(right(id::text, 2)::int order by 1), '{}') from public.announcements $$;

-- anon: no access at all
select tests.as_anon();
select throws_ok($$ select * from public.events $$, '42501', null, 'anon cannot read events');
select throws_ok($$ select * from public.announcements $$, '42501', null, 'anon cannot read announcements');
select throws_ok($$ select * from public.rsvps $$, '42501', null, 'anon cannot read rsvps');

-- Waiting room
select tests.authenticate_as('pending');
select is(pg_temp.ev(), '{}'::int[], 'pending user sees no events');
select is(pg_temp.an(), '{}'::int[], 'pending user sees no announcements');
select tests.authenticate_as('suspended');
select is(pg_temp.ev(), '{}'::int[], 'suspended user sees no events');
select is(pg_temp.an(), '{}'::int[], 'suspended user sees no announcements');

-- Members: national + own branch, own wing (or all), published and unhidden only
select tests.authenticate_as('member_a');
select is(pg_temp.ev(), array[1, 2, 8], 'youth member A sees national, branch A and all-audience events only');
select is(pg_temp.an(), array[1, 2, 8], 'youth member A sees national, branch A and all-audience announcements only');
select tests.authenticate_as('member_b');
select is(pg_temp.ev(), array[1, 3, 8], 'youth member B sees national, branch B and all-audience events only');
select is(pg_temp.an(), array[1, 3, 8], 'youth member B sees national, branch B and all-audience announcements only');
select tests.authenticate_as('guardian');
select is(pg_temp.ev(), array[4, 8], 'aiaia member sees aiaia and all-audience events, no youth ones');
select is(pg_temp.an(), array[4, 8], 'aiaia member sees aiaia and all-audience announcements, no youth ones');
select tests.authenticate_as('enforcement');
select is(pg_temp.ev(), array[1, 3, 8], 'enforcement committee (no content permission) sees only member content');

-- Scope officers also see drafts, scheduled and hidden rows in their scope, and nothing beyond it
select tests.authenticate_as('bp_a');
select is(pg_temp.ev(), array[1, 2, 5, 6, 8], 'branch officer A also sees branch A draft and hidden events');
select is(pg_temp.an(), array[1, 2, 5, 6, 8, 9], 'branch officer A also sees branch A draft, hidden and scheduled announcements');
select tests.authenticate_as('bp_b');
select is(pg_temp.ev(), array[1, 3, 8], 'branch officer B sees no branch A drafts or hidden events');
select is(pg_temp.an(), array[1, 3, 8], 'branch officer B sees no branch A drafts or hidden announcements');
select tests.authenticate_as('national_president');
select is(pg_temp.ev(), array[1, 2, 4, 7, 8], 'national officer sees every national event incl. hidden, but no branch drafts');
select is(pg_temp.an(), array[1, 2, 4, 7, 8], 'national officer sees every national announcement, but no branch drafts');
select tests.authenticate_as('mentor');
select is(pg_temp.ev(), array[1, 2, 3, 4, 5, 6, 7, 8], 'mentor (global) sees every event');
select tests.authenticate_as('super_admin');
select is(pg_temp.ev(), array[1, 2, 8], 'super admin without a step-up sees only member content');
select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select is(pg_temp.ev(), array[1, 2, 3, 4, 5, 6, 7, 8], 'super admin with a step-up sees every event');
select is(pg_temp.an(), array[1, 2, 3, 4, 5, 6, 7, 8, 9], 'super admin with a step-up sees every announcement');

-- Writes need the scope permission
select tests.authenticate_as('member_a');
select throws_ok($$ insert into public.events (scope, branch_id, title, starts_at, ends_at)
  values ('branch', tests.branch_id('A'), 'Member event', now(), now()) $$, '42501', null, 'member cannot create a branch event');
select ok(exists (select 1 from public.announcements where right(id::text, 2) = '01'), 'member A can see announcement 1');
select is_empty($$ with u as (update public.announcements set title = 'x' where right(id::text, 2) = '01' returning id) select id from u $$,
  'member A''s update of a visible announcement matches no rows');

select tests.authenticate_as('bp_a');
select lives_ok($$ insert into public.events (id, scope, branch_id, title, starts_at, ends_at)
  values ('e0000000-0000-4000-8000-0000000000f1', 'branch', tests.branch_id('A'), 'New branch A meet', now(), now()) $$,
  'branch officer A creates a branch A event');
select throws_ok($$ insert into public.events (scope, branch_id, title, starts_at, ends_at)
  values ('branch', tests.branch_id('B'), 'Branch B meet', now(), now()) $$, '42501', null, 'branch officer A cannot create a branch B event');
select throws_ok($$ insert into public.events (scope, title, starts_at, ends_at)
  values ('national', 'National meet', now(), now()) $$, '42501', null, 'branch officer A cannot create a national event');
select throws_ok($$ insert into public.announcements (scope, branch_id, title, body, author_member_id)
  values ('branch', tests.branch_id('A'), 'Forged', 'x', tests.member_id('bp_b')) $$, '42501', null,
  'branch officer A cannot post an announcement as someone else');
select ok(exists (select 1 from public.events where right(id::text, 2) = '01'), 'branch officer A can see national event 1');
select is_empty($$ with u as (update public.events set title = 'x' where right(id::text, 2) = '01' returning id) select id from u $$,
  'branch officer A''s update of a visible national event matches no rows');
select is_empty($$ with d as (delete from public.events where right(id::text, 2) = '01' returning id) select id from d $$,
  'branch officer A''s delete of a visible national event matches no rows');
select throws_ok($$ update public.events set branch_id = tests.branch_id('B') where right(id::text, 2) = '02' $$, '42501', null,
  'branch officer A cannot move a branch A event to branch B');
select throws_ok($$ update public.events set created_by = tests.member_id('bp_a') where right(id::text, 2) = '02' $$, '42501', null,
  'branch officer A cannot rewrite created_by');
select lives_ok($$ update public.events set hidden_at = now() where right(id::text, 2) = '05' $$, 'branch officer A can hide a branch A draft event');

-- announcements: blocked writes outside the officer's scope
select ok(exists (select 1 from public.announcements where right(id::text, 2) = '01'), 'branch officer A can see national announcement 1');
select is_empty($$ with d as (delete from public.announcements where right(id::text, 2) = '01' returning id) select id from d $$,
  'branch officer A cannot delete a national announcement they can see');
select is_empty($$ with d as (delete from public.announcements where right(id::text, 2) = '03' returning id) select id from d $$,
  'branch officer A cannot delete a branch B announcement (not visible to them either)');
select tests.clear_auth();
select is((select count(*)::int from public.announcements where right(id::text, 2) in ('01', '03')), 2,
  'announcements 1 and 3 still exist after the blocked deletes');
select tests.authenticate_as('bp_a');
select throws_ok($$ insert into public.announcements (scope, branch_id, title, body, author_member_id)
  values ('branch', tests.branch_id('B'), 'Cross-branch', 'x', tests.member_id('bp_a')) $$, '42501', null,
  'branch officer A cannot post a branch B announcement as themselves');
select throws_ok($$ insert into public.announcements (scope, title, body, author_member_id)
  values ('national', 'Cross-scope', 'x', tests.member_id('bp_a')) $$, '42501', null,
  'branch officer A cannot post a national announcement as themselves');

select tests.authenticate_as('national_president');
select ok(exists (select 1 from public.events where right(id::text, 2) = '02'), 'national officer can see branch A event 2 as a member');
select is_empty($$ with u as (update public.events set title = 'x' where right(id::text, 2) = '02' returning id) select id from u $$,
  'national officer''s update of a visible branch event matches no rows');

select tests.clear_auth();
select is((select count(*)::int from public.audit_log where entity = 'events' and entity_id = 'e0000000-0000-4000-8000-0000000000f1'
  and action = 'events.insert' and actor_member_id = tests.member_id('bp_a')), 1, 'the officer''s event insert is audited');

-- rsvps: own (active), active guardians' wards, scope officers; no direct writes
-- The P1-00b age guard cuts guardians off on the ward's 18th birthday; keep the turns_18 ward a
-- minor (18 tomorrow) so the guardian count below still tests the link.
update public.member_private set dob = dob + 1 where member_id = tests.member_id('turns_18');
insert into public.rsvps (event_id, member_id) values
  ('e0000000-0000-4000-8000-000000000001', tests.member_id('member_a')),
  ('e0000000-0000-4000-8000-000000000001', tests.member_id('pending')),
  ('e0000000-0000-4000-8000-000000000003', tests.member_id('member_b')),
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('dependent_9')),
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('turns_18'));

select tests.authenticate_as('pending');
select is_empty($$ select * from public.rsvps $$, 'pending user sees no rsvps, not even their own');
select tests.authenticate_as('member_a');
select results_eq($$ select member_id from public.rsvps $$, $$ select tests.member_id('member_a') $$, 'member A sees only their own rsvp');
select throws_ok($$ insert into public.rsvps (event_id, member_id) values ('e0000000-0000-4000-8000-000000000008', tests.member_id('member_a')) $$,
  '42501', null, 'members cannot write rsvps directly');
select tests.authenticate_as('guardian');
select is((select count(*)::int from public.rsvps), 2, 'guardian sees the rsvps of their two wards');
select tests.authenticate_as('bp_a');
select is((select array_agg(member_id order by member_id) from public.rsvps),
  array[tests.member_id('turns_18'), tests.member_id('dependent_9')], 'branch officer A sees rsvps for branch A events only');
select tests.authenticate_as('bp_b');
select results_eq($$ select member_id from public.rsvps $$, $$ select tests.member_id('member_b') $$, 'branch officer B sees rsvps for branch B events only');

-- Event delete: only drafts. First a published event with no check-ins or rsvps, so the policy alone
-- decides (no foreign key can block the delete and mask a policy regression).
select tests.clear_auth();
insert into public.events (id, scope, branch_id, title, starts_at, ends_at, status, created_by)
values ('e0000000-0000-4000-8000-0000000000c7', 'branch', tests.branch_id('A'), 'Published, no attendees',
        now() + interval '7 days', now() + interval '7 days 2 hours', 'published', tests.member_id('bp_a'));
select tests.authenticate_as('bp_a');
select ok(exists (select 1 from public.events where right(id::text, 2) = 'c7' and status = 'published'),
  'branch officer A can see their published event c7 (no attendees)');
select throws_ok($$ update public.events set status = 'draft' where right(id::text, 2) = 'c7' $$, '42501', null,
  'branch officer A cannot set a published event back to draft');
select is_empty($$ with d as (delete from public.events where right(id::text, 2) = 'c7' returning id) select id from d $$,
  'branch officer A cannot delete a published event even when nothing references it');

-- The foreign keys themselves must restrict, independently of the policy.
select is((select confdeltype::text from pg_constraint
           where conrelid = 'public.check_ins'::regclass and confrelid = 'public.events'::regclass and contype = 'f'),
  'r', 'check_ins.event_id is on delete restrict');
select is((select confdeltype::text from pg_constraint
           where conrelid = 'public.rsvps'::regclass and confrelid = 'public.events'::regclass and contype = 'f'),
  'r', 'rsvps.event_id is on delete restrict');

-- Branch officer A sees published event 02 with a check-in, and cannot delete it.
select tests.clear_auth();
insert into public.check_ins (event_id, member_id, client_ref)
values ('e0000000-0000-4000-8000-000000000002', tests.member_id('member_a'), gen_random_uuid());
select tests.authenticate_as('bp_a');
select ok(exists (select 1 from public.events where right(id::text, 2) = '02' and status = 'published'),
  'branch officer A can see published event 02');
select is_empty($$ with d as (delete from public.events where right(id::text, 2) = '02' returning id) select id from d $$,
  'branch officer A cannot delete a published event they can see');
select tests.clear_auth();
select ok(exists (select 1 from public.events where right(id::text, 2) = '02'), 'event 02 still exists');
select is((select count(*)::int from public.check_ins where event_id = 'e0000000-0000-4000-8000-000000000002'), 1,
  'the check-in on event 02 still exists');
select throws_ok($$ delete from public.events where right(id::text, 2) = '02' $$, '23503', null,
  'even the owner cannot delete an event that has check-ins');
select tests.authenticate_as('bp_a');
select ok(exists (select 1 from public.events where right(id::text, 2) = '05' and status = 'draft'), 'branch officer A can see draft event 05');
select isnt_empty($$ with d as (delete from public.events where right(id::text, 2) = '05' returning id) select id from d $$,
  'branch officer A can delete their own draft event');

select tests.clear_auth();
select * from finish();
rollback;

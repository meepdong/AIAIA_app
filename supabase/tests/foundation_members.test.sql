-- members / member_private RLS: waiting room, private-data isolation, guardian links, approver
-- scope, self-service column whitelist. Fixtures: supabase/seeds/p0-02.sql.
begin;
select plan(56);

-- anon sees nothing
select tests.as_anon();
select is_empty($$ select id from public.members $$, 'anon sees no members rows');
select is_empty($$ select member_id from public.member_private $$, 'anon sees no member_private rows');

-- Waiting room: pending and suspended users see only their own rows
select tests.authenticate_as('pending');
select results_eq($$ select id from public.members $$, $$ select tests.member_id('pending') $$,
  'pending user sees only their own members row');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('pending') $$,
  'pending user sees only their own member_private row');
select is_empty($$ select key from public.roles $$, 'pending user sees no roles');
select isnt_empty($$ select id from public.branches $$, 'pending user sees the branch list');

select tests.authenticate_as('suspended');
select results_eq($$ select id from public.members $$, $$ select tests.member_id('suspended') $$,
  'suspended user sees only their own members row');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('suspended') $$,
  'suspended user sees only their own member_private row');

-- Active member: other active members only through member_cards (P1-00c decision 8), and no one
-- else's member_private
select tests.authenticate_as('member_a');
select isnt_empty($$ select id from public.member_cards where id = tests.member_id('member_b') $$,
  'member A sees active member B''s card');
select is_empty($$ select id from public.member_cards
                   where id in (tests.member_id('pending'), tests.member_id('suspended'), tests.member_id('pending_36')) $$,
  'member A sees no pending, suspended or other non-active members'' cards');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('member_a') $$,
  'member A sees only their own member_private row');
select is_empty($$ select member_id from public.member_private
                   where member_id in (tests.member_id('minor_16'), tests.member_id('dependent_9')) $$,
  'member A cannot see minors'' member_private rows');

-- A minor with a login sees only their own private row too
select tests.authenticate_as('minor_16');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('minor_16') $$,
  'a 16-year-old member sees only their own member_private row');

-- Guardian: wards' rows only while the link is active
select tests.authenticate_as('guardian');
select set_eq(
  $$ select member_id from public.member_private where member_id <> tests.member_id('guardian') $$,
  $$ values (tests.member_id('dependent_9')) $$,
  -- P1-00b age guard (spec-driven change): turns_18 (own login, 18 today) and dependent_adult
  -- (no login, past the 90-day grace period) are cut off even though their links are still active.
  'guardian sees exactly their minor wards'' member_private rows while the links are active');
select lives_ok(
  $$ update public.member_private set emergency_contact_name = 'Vikram Fixture'
     where member_id = tests.member_id('dependent_9') $$,
  'guardian can update a ward''s emergency contact while the link is active');

select tests.clear_auth();
select is((select emergency_contact_name from public.member_private where member_id = tests.member_id('dependent_9')),
  'Vikram Fixture', 'the guardian''s update landed');
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
where guardian_member_id = tests.member_id('guardian');

select tests.authenticate_as('guardian');
select is_empty($$ select member_id from public.member_private where member_id <> tests.member_id('guardian') $$,
  'guardian whose links have ended_at set sees zero ward member_private rows');
select lives_ok(
  $$ update public.member_private set emergency_contact_name = 'Meera Sampleton'
     where member_id = tests.member_id('dependent_9') $$,
  'ended-link guardian update runs');

select tests.clear_auth();
select is((select emergency_contact_name from public.member_private where member_id = tests.member_id('dependent_9')),
  'Vikram Fixture', 'ended-link guardian update changed nothing');
update public.member_guardians set ended_at = null, ended_reason = null
where guardian_member_id = tests.member_id('guardian');
update public.members set status = 'suspended' where id = tests.member_id('guardian');

select tests.authenticate_as('guardian');
select is_empty($$ select member_id from public.member_private where member_id <> tests.member_id('guardian') $$,
  'suspended guardian with active links sees zero ward member_private rows');
select results_eq($$ select id from public.members $$, $$ select tests.member_id('guardian') $$,
  'suspended guardian sees only their own members row');

select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('guardian');

-- Approvers: members rows stay scoped to their own branch (member_private is covered below)
select tests.authenticate_as('bp_a');
select isnt_empty($$ select member_id from public.member_private where member_id = tests.member_id('pending') $$,
  'branch president A sees the branch A applicant''s member_private');
select isnt_empty($$ select id from public.members where id = tests.member_id('pending') $$,
  'branch president A sees the branch A applicant''s members row');
select is_empty($$ select id from public.members where id = tests.member_id('pending_36') $$,
  'branch president A does not see the branch B applicant''s members row');

select tests.authenticate_as('bp_b');
select isnt_empty($$ select member_id from public.member_private where member_id = tests.member_id('pending_36') $$,
  'branch president B sees the branch B applicant''s member_private');

-- Officers (members.approve anywhere) read every member's private row; owner ruling 2026-11-13
select tests.authenticate_as('bp_a');
select set_eq($$ select member_id from public.member_private
                 where member_id in (tests.member_id('member_a'), tests.member_id('pending_36'),
                                     tests.member_id('member_b'), tests.member_id('minor_16')) $$,
  $$ values (tests.member_id('member_a')), (tests.member_id('pending_36')),
            (tests.member_id('member_b')), (tests.member_id('minor_16')) $$,
  'branch president A sees member_private of active A and B members, a B applicant and a minor');

-- Non-officers, and officers who do not currently count, see only their own row
select tests.authenticate_as('member_a');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('member_a') $$,
  'member A without an officer role sees only their own member_private row');

-- Holding other permissions is not enough: only members.approve makes an officer
select tests.authenticate_as('enforcement');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('enforcement') $$,
  'enforcement committee (no members.approve) sees only their own member_private row');
select tests.authenticate_as('support_staff');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('support_staff') $$,
  'support staff (no members.approve) sees only their own member_private row');

select tests.clear_auth();
insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  (tests.member_id('pending'), 'branch_president', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 30),
  (tests.member_id('suspended'), 'branch_president', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 30);
select tests.authenticate_as('pending');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('pending') $$,
  'pending holder of a branch_president assignment sees only their own row');
select tests.authenticate_as('suspended');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('suspended') $$,
  'suspended holder of a branch_president assignment sees only their own row');

select tests.clear_auth();
update public.role_assignments
set starts_on = (now() at time zone 'Asia/Kolkata')::date - 60,
    ends_on = (now() at time zone 'Asia/Kolkata')::date - 1
where member_id = tests.member_id('bp_a');
select tests.authenticate_as('bp_a');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('bp_a') $$,
  'officer whose assignment ended yesterday sees only their own row');

-- Nobody can change their own status (or other protected columns)
select tests.authenticate_as('member_a');
select throws_ok($$ update public.members set status = 'suspended' where id = tests.member_id('member_a') $$,
  '42501', null, 'active member cannot change their own status');
select lives_ok($$ update public.members set bio = 'Likes testing' where id = tests.member_id('member_a') $$,
  'active member can change a whitelisted column (bio)');
select throws_ok($$ update public.member_private set dob = '2000-01-01' where member_id = tests.member_id('member_a') $$,
  '42501', null, 'active member cannot change their own dob');

select tests.authenticate_as('pending');
select throws_ok($$ update public.members set status = 'active' where id = tests.member_id('pending') $$,
  '42501', null, 'pending applicant cannot activate themselves');

select tests.authenticate_as('suspended');
select throws_ok($$ update public.members set status = 'active' where id = tests.member_id('suspended') $$,
  '42501', null, 'suspended member cannot reactivate themselves');

select tests.authenticate_as('bp_a');
select throws_ok($$ update public.members set status = 'suspended' where id = tests.member_id('bp_a') $$,
  '42501', null, 'branch president cannot change their own status');

-- Officers can read every private row (select-only policy) but must not be able to write any of them
select tests.clear_auth();
create temp table private_snapshot as
  select member_id, emergency_contact_name from public.member_private;
grant select on private_snapshot to authenticated;

-- bp_a's assignment was ended above, so use bp_b (still an officer) and first prove the rows are
-- visible: a blocked write against a row the caller cannot see would pin nothing.
select tests.authenticate_as('bp_b');
select set_eq($$ select member_id from public.member_private
                  where member_id in (tests.member_id('dependent_9'), tests.member_id('member_b')) $$,
  $$ values (tests.member_id('dependent_9')), (tests.member_id('member_b')) $$,
  'precondition: the officer can read the rows the write tests target');
select is_empty($$ with u as (update public.member_private set emergency_contact_name = 'Kabir Fixture'
                              where member_id = tests.member_id('dependent_9') returning member_id)
                   select member_id from u $$,
  'branch president cannot update a minor dependent''s private row they can read');
select is_empty($$ with u as (update public.member_private set emergency_contact_name = 'Kabir Fixture'
                              where member_id = tests.member_id('member_b') returning member_id)
                   select member_id from u $$,
  'branch president cannot update another branch member''s private row they can read');
select is_empty($$ with d as (delete from public.member_private
                              where member_id = tests.member_id('member_b') returning member_id)
                   select member_id from d $$,
  'branch president cannot delete a private row they can read');
select tests.authenticate_as('national_president');
select is_empty($$ with u as (update public.member_private set emergency_contact_name = 'Kabir Fixture'
                              where member_id = tests.member_id('minor_16') returning member_id)
                   select member_id from u $$,
  'national president cannot update a minor''s private row they can read');

select tests.clear_auth();
select is_empty($$ select m.member_id from public.member_private m
                   join private_snapshot s using (member_id)
                   where m.emergency_contact_name is distinct from s.emergency_contact_name $$,
  'officer write attempts left every emergency_contact_name unchanged');
select isnt_empty($$ select 1 from public.member_private where member_id = tests.member_id('member_b') $$,
  'officer delete attempt left the private row in place');

-- Officer term not started: only their own row, and no permissions
insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  (tests.member_id('member_b'), 'branch_president', tests.branch_id('B'),
   (now() at time zone 'Asia/Kolkata')::date + 1);
select tests.authenticate_as('member_b');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('member_b') $$,
  'officer whose term starts tomorrow sees only their own member_private row');
select is_empty($$ select * from public.my_permissions() $$,
  'officer whose term starts tomorrow holds no permissions');

-- Super admin without a step-up (has_step_up is not stubbed here) is not an officer
select tests.authenticate_as('super_admin');
select results_eq($$ select member_id from public.member_private $$, $$ select tests.member_id('super_admin') $$,
  'super admin without a step-up sees only their own member_private row');

-- Signed in, but no members row at all
select tests.clear_auth();
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000030',
  'authenticated', 'authenticated', '919000000030', now(), '{}', '{}', now(), now()
);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b0000000-0000-4000-8000-000000000030', 'role', 'authenticated', 'aud', 'authenticated',
  'session_id', md5('session:orphan')::uuid)::text, true);
select is_empty($$ select id from public.members $$, 'user without a members row sees no members');
select is_empty($$ select member_id from public.member_private $$, 'user without a members row sees no member_private');
select is_empty($$ select member_id from public.member_guardians $$, 'user without a members row sees no member_guardians');
select is_empty($$ select member_id from public.role_assignments $$, 'user without a members row sees no role_assignments');
select is_empty($$ select member_id from public.member_status_events $$, 'user without a members row sees no member_status_events');
select is_empty($$ select key from public.roles $$, 'user without a members row sees no roles');
select isnt_empty($$ select id from public.branches $$, 'user without a members row sees the branch list');
select is_empty($$ select * from public.my_permissions() $$, 'user without a members row holds no permissions');

select tests.clear_auth();
select * from finish();
rollback;

-- Blocked-path tests for the remaining RLS policies: each would fail if its policy were `true`.
-- Fixtures: supabase/seeds/p0-02.sql (member_a and bp_a are in branch A; member_b and bp_b in B).
begin;
select plan(33);

-- members_update_own: a member cannot update someone else's row (0 rows match, no error)
select tests.authenticate_as('member_a');
select is_empty(
  $$ with u as (update public.members set bio = 'x' where id = tests.member_id('member_b') returning id)
     select id from u $$,
  'member A''s update of member B''s members row matches no rows');
select tests.clear_auth();
select is((select bio from public.members where id = tests.member_id('member_b')), null,
  'member B''s bio is unchanged after member A''s update attempt');

-- branches: writes need system.config. Members and branch presidents have none.
select tests.authenticate_as('member_a');
select throws_ok($$ insert into public.branches (code, name) values ('HACK', 'Hacked Branch') $$,
  '42501', null, 'member A cannot insert a branch');
select is_empty(
  $$ with u as (update public.branches set name = 'Hacked' where id = tests.branch_id('A') returning id)
     select id from u $$, 'member A''s branch update matches no rows');
select is_empty(
  $$ with d as (delete from public.branches where id = tests.branch_id('B') returning id)
     select id from d $$, 'member A''s branch delete matches no rows');

select tests.authenticate_as('bp_a');
select throws_ok($$ insert into public.branches (code, name) values ('HACK', 'Hacked Branch') $$,
  '42501', null, 'branch president A cannot insert a branch');
select is_empty(
  $$ with u as (update public.branches set name = 'Hacked' where id = tests.branch_id('A') returning id)
     select id from u $$, 'branch president A''s update of their own branch matches no rows');
select is_empty(
  $$ with d as (delete from public.branches where id = tests.branch_id('A') returning id)
     select id from d $$, 'branch president A''s delete of their own branch matches no rows');

select tests.clear_auth();
select is((select count(*)::int from public.branches where id in (tests.branch_id('A'), tests.branch_id('B'))
           and name <> 'Hacked'), 2, 'both fixture branches still exist, unrenamed');
select is((select count(*)::int from public.branches where code = 'HACK'), 0, 'no branch was inserted');

-- role_assignments_select: own rows, plus all for roles.assign
select tests.authenticate_as('member_a');
select is_empty($$ select member_id from public.role_assignments $$,
  'member A (no role assignments) sees no role_assignments rows');
select tests.authenticate_as('bp_a');
select results_eq($$ select member_id from public.role_assignments $$, $$ select tests.member_id('bp_a') $$,
  'branch president A sees only their own role assignment');
select tests.authenticate_as('national_president');
select is((select count(*)::int from public.role_assignments), 8,
  'national president (roles.assign) sees all 8 fixture role assignments');

-- member_status_events_select: own history, plus members.manage for the member's branch
select tests.clear_auth();
insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by) values
  (tests.member_id('member_b'), 'pending', 'active', null, tests.member_id('bp_b'));

select tests.authenticate_as('bp_a');
select isnt_empty($$ select id from public.member_status_events where member_id = tests.member_id('member_a') $$,
  'branch president A sees the status events of branch A member A');
select is_empty($$ select id from public.member_status_events where member_id = tests.member_id('member_b') $$,
  'branch president A sees no status events of branch B member B');
select is_empty($$ select e.id from public.member_status_events e
                   join public.members m on m.id = e.member_id where m.branch_id <> tests.branch_id('A') $$,
  'branch president A sees no branch B status events at all');

select tests.authenticate_as('member_a');
select results_eq($$ select member_id from public.member_status_events $$, $$ select tests.member_id('member_a') $$,
  'member A sees only their own status events');

-- member_guardians_select_party: only the two people on a link
select tests.authenticate_as('member_a');
select is_empty($$ select member_id from public.member_guardians $$,
  'member A sees none of the guardian link rows');
select tests.authenticate_as('guardian');
select is((select count(*)::int from public.member_guardians), 3, 'the guardian sees their 3 link rows');

-- photo_path is self-editable but pinned to the member's own storage folder
select tests.authenticate_as('member_a');
select throws_ok($$ update public.members set photo_path = 'consents/x.pdf' where id = tests.member_id('member_a') $$,
  '23514', null, 'a member cannot point photo_path outside their own folder');
select throws_ok(
  $$ update public.members set photo_path = 'members/' || tests.member_id('member_b')::text || '/a.jpg'
     where id = tests.member_id('member_a') $$,
  '23514', null, 'a member cannot point photo_path at another member''s folder');
select throws_ok(
  $$ update public.members set photo_path = 'members/' || tests.member_id('member_a')::text || '/../../consents/x.pdf'
     where id = tests.member_id('member_a') $$,
  '23514', null, 'a member cannot escape their folder with .. segments');
select throws_ok(
  $$ update public.members set photo_path = 'members/' || tests.member_id('member_a')::text || '/a' || chr(92) || 'b.jpg'
     where id = tests.member_id('member_a') $$,
  '23514', null, 'a member cannot put backslashes in photo_path');
select lives_ok(
  $$ update public.members set photo_path = 'members/' || tests.member_id('member_a')::text || '/a.jpg'
     where id = tests.member_id('member_a') $$,
  'a member can set photo_path inside their own folder');

-- Former guardians: an ended link disappears for the guardian but stays in the ward's history
select tests.clear_auth();
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
where member_id = tests.member_id('turns_18');
select tests.authenticate_as('guardian');
select is_empty($$ select member_id from public.member_guardians where member_id = tests.member_id('turns_18') $$,
  'a former guardian sees zero rows for the link that ended');
select is((select count(*)::int from public.member_guardians), 2, 'the guardian still sees their 2 active links');
select tests.authenticate_as('turns_18');
select isnt_empty($$ select member_id from public.member_guardians where member_id = tests.member_id('turns_18') $$,
  'the ward still sees their own ended link');
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select is_empty($$ select member_id from public.member_guardians $$,
  'a suspended guardian sees no link rows even for active links');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('guardian');

-- super admin with a step-up can write branches
select tests.clear_auth();
create or replace function public.has_step_up()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select true; $$;
select tests.authenticate_as('super_admin');
select lives_ok($$ insert into public.branches (code, name) values ('TST', 'Test Branch') $$,
  'super admin with a step-up can insert a branch');
select lives_ok($$ update public.branches set name = 'Test Branch Renamed' where code = 'TST' $$,
  'super admin with a step-up can update a branch');
select tests.clear_auth();
select is((select name from public.branches where code = 'TST'), 'Test Branch Renamed',
  'the super admin''s branch update landed');
select is((select count(*)::int from public.audit_log
           where action = 'branches.insert' and entity = 'branches'
             and entity_id = (select id::text from public.branches where code = 'TST')
             and actor_member_id = tests.member_id('super_admin')
             and actor_user_id = tests.user_id('super_admin')), 1,
  'the super admin''s branch insert wrote an audit_log row with the actor');
select is((select count(*)::int from public.audit_log
           where action = 'branches.update' and entity_id = (select id::text from public.branches where code = 'TST')
             and details ->> 'name' = 'Test Branch Renamed'), 1,
  'the super admin''s branch update wrote an audit_log row');

select * from finish();
rollback;

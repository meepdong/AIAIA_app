-- has_permission(): branch scoping, waiting room, term dates, step-up roles. Fixtures: supabase/seeds/p0-02.sql.
begin;
select plan(38);

-- anon cannot call it at all
select tests.as_anon();
select throws_ok($$ select public.has_permission('members.approve') $$, '42501', null,
  'anon cannot call has_permission');
select tests.clear_auth();

-- Waiting room: pending and suspended users with a branch_president A assignment get nothing
insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  (tests.member_id('pending'), 'branch_president', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 30),
  (tests.member_id('suspended'), 'branch_president', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 30);

select tests.authenticate_as('pending');
select ok(not public.has_permission('members.approve', tests.branch_id('A')),
  'pending user with a branch_president A assignment cannot approve for A');
select is_empty($$ select * from public.my_permissions() $$, 'pending user has no effective permissions');

select tests.authenticate_as('suspended');
select ok(not public.has_permission('members.approve', tests.branch_id('A')),
  'suspended user with a branch_president A assignment cannot approve for A');
select is_empty($$ select * from public.my_permissions() $$, 'suspended user has no effective permissions');

-- Branch scoping
select tests.authenticate_as('bp_a');
select ok(public.has_permission('members.approve', tests.branch_id('A')), 'branch president A can approve for A');
select ok(not public.has_permission('members.approve', tests.branch_id('B')), 'branch president A cannot approve for B');
select ok(not public.has_permission('members.approve'), 'branch president A has no branch-less members.approve');
select ok(not public.has_permission('system.config', tests.branch_id('A')), 'branch president A has no system.config');
select ok(not public.has_permission('audit.view'), 'branch president A has no audit.view');
select results_eq(
  $$ select distinct branch_id from public.my_permissions() $$,
  $$ select tests.branch_id('A') $$,
  'branch president A: every effective permission is scoped to branch A');

select tests.authenticate_as('bp_b');
select ok(public.has_permission('members.approve', tests.branch_id('B')), 'branch president B can approve for B');
select ok(not public.has_permission('members.approve', tests.branch_id('A')), 'branch president B cannot approve for A');

-- National roles: any branch, and branch-less
select tests.authenticate_as('national_president');
select ok(public.has_permission('members.approve', tests.branch_id('A')), 'national president can approve for A');
select ok(public.has_permission('members.approve', tests.branch_id('B')), 'national president can approve for B');
select ok(public.has_permission('members.approve'), 'national president has branch-less members.approve');
select ok(not public.has_permission('system.config'), 'national president has no system.config');

select tests.authenticate_as('national_treasurer');
select ok(public.has_permission('members.approve', tests.branch_id('A'))
  and public.has_permission('members.approve', tests.branch_id('B'))
  and public.has_permission('members.approve'),
  'national treasurer can approve for A, B and branch-less');

-- Mentor (global, everything except system.config and members.block; no step-up needed)
select tests.authenticate_as('mentor');
select ok(public.has_permission('members.approve', tests.branch_id('A'))
  and public.has_permission('members.approve', tests.branch_id('B'))
  and public.has_permission('audit.view'),
  'mentor can approve for any branch and view the audit log');
select ok(not public.has_permission('system.config'), 'mentor has no system.config');
select ok(not public.has_permission('members.block'), 'mentor has no members.block');

-- Enforcement committee (global: reports.review, members.block, content.remove)
select tests.authenticate_as('enforcement');
select ok(public.has_permission('members.block') and public.has_permission('members.block', tests.branch_id('B')),
  'enforcement committee can block members');
select ok(not public.has_permission('members.approve', tests.branch_id('A')), 'enforcement committee cannot approve');
select ok(not public.has_permission('audit.view'), 'enforcement committee has no audit.view');

-- Support staff (national: members.change_phone, members.support_view, members.verify_id)
select tests.authenticate_as('support_staff');
select ok(public.has_permission('members.change_phone'), 'support staff can change phones');
select ok(not public.has_permission('members.approve', tests.branch_id('A')) and not public.has_permission('members.approve'),
  'support staff cannot approve');

-- An ordinary active member holds nothing
select tests.authenticate_as('member_a');
select ok(not public.has_permission('members.approve', tests.branch_id('A')), 'active member without a role cannot approve');

-- Term dates (inclusive, Asia/Kolkata)
select tests.clear_auth();
update public.role_assignments set ends_on = (now() at time zone 'Asia/Kolkata')::date - 1
where member_id = tests.member_id('bp_a');
select tests.authenticate_as('bp_a');
select ok(not public.has_permission('members.approve', tests.branch_id('A')), 'assignment that ended yesterday grants nothing');
select is_empty($$ select * from public.my_permissions() $$, 'ended assignment: no effective permissions');

select tests.clear_auth();
update public.role_assignments set ends_on = (now() at time zone 'Asia/Kolkata')::date
where member_id = tests.member_id('bp_a');
select tests.authenticate_as('bp_a');
select ok(public.has_permission('members.approve', tests.branch_id('A')), 'assignment ending today still grants');

select tests.clear_auth();
update public.role_assignments
set starts_on = (now() at time zone 'Asia/Kolkata')::date + 1, ends_on = null
where member_id = tests.member_id('bp_a');
select tests.authenticate_as('bp_a');
select ok(not public.has_permission('members.approve', tests.branch_id('A')), 'assignment starting tomorrow grants nothing');

-- Super admin: powers count only with a step-up
select tests.authenticate_as('super_admin');
select ok(not public.has_step_up(), 'phase 0: no session holds a step-up');
select ok(not public.has_permission('system.config'), 'super admin without step-up has no system.config');
select ok(not public.has_permission('members.approve', tests.branch_id('A')), 'super admin without step-up cannot approve');
select is_empty($$ select * from public.my_permissions() $$, 'super admin without step-up has no effective permissions');

select tests.clear_auth();
create or replace function public.has_step_up()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select true; $$;

select tests.authenticate_as('super_admin');
select ok(public.has_permission('system.config'), 'super admin with step-up has system.config');
select ok(public.has_permission('members.approve', tests.branch_id('B')), 'super admin with step-up can approve for any branch');

-- A step-up never revives a suspended super admin
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(not public.has_permission('system.config'), 'suspended super admin with step-up has nothing');

select tests.clear_auth();
select * from finish();
rollback;

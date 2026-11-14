-- P1-00b chunk 2: block_member, unblock_member, request_block, assign_role, end_role, reports.priority.
-- Fixtures: supabase/seeds/p0-02.sql. super_admin (1) is the only super admin; mentor (2) holds
-- members.request_block and roles.assign but not members.block or system.config; enforcement (7)
-- holds members.block; national_president (3) holds roles.assign. No extra members are created.
begin;
select plan(82);

-- Role assignment ids, readable after switching to an authenticated caller.
create function tests.p1_00b_ra(member_key text, role text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select ra.id from public.role_assignments ra
  where ra.member_id = tests.member_id(member_key) and ra.role_key = role
  order by ra.created_at desc limit 1;
$$;
grant execute on function tests.p1_00b_ra(text, text) to authenticated;

-- ===== reports.priority ==================================================
select col_not_null('public', 'reports', 'priority', 'reports.priority is not null');
select throws_ok($$ insert into public.reports (reporter_member_id, target_type, target_id, reason, priority)
                    values (tests.member_id('member_a'), 'member', tests.member_id('member_b'), 'spam', 'urgent') $$,
  '23514', null, 'reports.priority accepts only high or normal');

-- ===== block_member: refused callers =====================================
select tests.authenticate_as('national_president');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), 'Harassment') $$, '42501', null,
  'block_member: a national president cannot block');
select tests.authenticate_as('mentor');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), 'Harassment') $$, '42501', null,
  'block_member: the mentor cannot block');
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), 'Harassment') $$, '42501', null,
  'block_member: a super admin without a step-up cannot block');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), 'Harassment') $$, '42501', null,
  'block_member: a branch president cannot block');
select tests.authenticate_as('member_b');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), 'Harassment') $$, '42501', null,
  'block_member: an ordinary member cannot block');
select tests.as_anon();
select throws_ok($$ select public.block_member('a0000000-0000-4000-8000-000000000009', 'Harassment') $$, '42501', null,
  'block_member: anon cannot block');
select tests.clear_auth();
select is((select count(*)::int from public.members where id = tests.member_id('member_a') and status = 'active'), 1,
  'the refused blocks changed nothing');

-- ===== request_block =====================================================
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.request_block(tests.member_id('member_a'), 'Repeated harassment') $$, '42501', null,
  'request_block: a branch president cannot request a block');
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.request_block(tests.member_id('member_a'), 'Repeated harassment') $$, '42501', null,
  'request_block: the Enforcement Committee blocks directly and cannot request');
select tests.authenticate_as('mentor');
select throws_ok($$ select public.request_block(tests.member_id('member_a'), '   ') $$, '22023', null,
  'request_block: a reason is required');
select throws_ok($$ select public.request_block('a0000000-0000-4000-8000-0000000000ff', 'Repeated harassment') $$,
  '22023', null, 'request_block: an unknown member is refused');
select throws_ok($$ select public.request_block(tests.member_id('mentor'), 'Repeated harassment') $$, '23514', null,
  'request_block: the mentor cannot request their own block');
select throws_ok($$ select public.request_block(tests.member_id('suspended'), 'Repeated harassment') $$, '23514', null,
  'request_block: an already suspended member is refused');
select lives_ok($$ select public.request_block(tests.member_id('member_a'), 'Repeated harassment') $$,
  'request_block: the mentor requests a block');
select throws_ok($$ select public.request_block(tests.member_id('member_a'), 'Again') $$, '23514', null,
  'request_block: a second open request for the same member is refused');
select tests.clear_auth();
select is((select count(*)::int from public.reports
           where reason = 'block_request' and target_type = 'member' and target_id = tests.member_id('member_a')
             and priority = 'high' and status = 'open' and reporter_member_id = tests.member_id('mentor')
             and details = 'Repeated harassment'), 1,
  'request_block files one open, high-priority block_request report with the mentor as reporter');
select is((select status::text from public.members where id = tests.member_id('member_a')), 'active',
  'request_block leaves the target active');
select results_eq(
  $$ select member_id from public.notifications where kind = 'membership.block_requested' and priority = 'high'
     order by member_id $$,
  $$ values (tests.member_id('super_admin')), (tests.member_id('enforcement')) $$,
  'request_block notifies every members.block holder (super admin and Enforcement Committee), high priority');
select is_empty($$ select 1 from public.notifications where kind = 'membership.block_requested'
                   and (body ~ '[0-9]{6}' or title ~* 'harassment' or body ~* 'harassment') $$,
  'block request notifications carry no reason or numbers');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.block_requested'
                     and actor_member_id = tests.member_id('mentor')
                     and details ->> 'target_member_id' = tests.member_id('member_a')::text $$,
  'request_block writes an audit row');

-- ===== block_member: Enforcement Committee ===============================
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), '') $$, '22023', null,
  'block_member: a reason is required');
select throws_ok($$ select public.block_member('a0000000-0000-4000-8000-0000000000ff', 'Harassment') $$, '22023', null,
  'block_member: an unknown member is refused');
select throws_ok($$ select public.block_member(tests.member_id('enforcement'), 'Harassment') $$, '23514', null,
  'block_member: nobody can block themselves');
select throws_ok($$ select public.block_member(tests.member_id('super_admin'), 'Harassment') $$, '23514', null,
  'block_member: the last super admin cannot be blocked');
select lives_ok($$ select public.block_member(tests.member_id('member_a'), 'Repeated harassment, confirmed') $$,
  'block_member: the Enforcement Committee blocks');
select throws_ok($$ select public.block_member(tests.member_id('member_a'), 'Again') $$, '23514', null,
  'block_member: an already suspended member is refused');
select tests.clear_auth();
select is((select status::text || '|' || status_reason from public.members where id = tests.member_id('member_a')),
  'suspended|Repeated harassment, confirmed', 'block_member sets status suspended and status_reason');
select is((select count(*)::int from public.reports
           where reason = 'block_request' and target_id = tests.member_id('member_a')
             and status = 'resolved' and resolved_at is not null and assigned_to = tests.member_id('enforcement')), 1,
  'block_member closes the open block request');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('member_a')
                     and from_status = 'active' and to_status = 'suspended'
                     and changed_by = tests.member_id('enforcement') $$,
  'block_member writes a status event');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.blocked'
                     and entity_id = tests.member_id('member_a')::text
                     and actor_member_id = tests.member_id('enforcement')
                     and (details ->> 'closed_block_requests')::int = 1 $$,
  'block_member writes an audit row');
select is((select count(*)::int from public.members where id = tests.member_id('super_admin') and status = 'active'), 1,
  'the refused block of the last super admin changed nothing');

-- ===== block_member: super admin with a step-up ==========================
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select lives_ok($$ select public.block_member(tests.member_id('member_b'), 'Spam') $$,
  'block_member: a super admin with a step-up blocks');
select tests.clear_auth();
select is((select status::text from public.members where id = tests.member_id('member_b')), 'suspended',
  'the super admin''s block suspended the member');

-- ===== unblock_member ====================================================
select tests.authenticate_as('mentor');
select throws_ok($$ select public.unblock_member(tests.member_id('member_a')) $$, '42501', null,
  'unblock_member: the mentor cannot unblock');
select tests.authenticate_as('national_president');
select throws_ok($$ select public.unblock_member(tests.member_id('member_a')) $$, '42501', null,
  'unblock_member: a national president cannot unblock');
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.unblock_member(tests.member_id('mentor')) $$, '23514', null,
  'unblock_member: an active member cannot be unblocked');
select throws_ok($$ select public.unblock_member('a0000000-0000-4000-8000-0000000000ff') $$, '22023', null,
  'unblock_member: an unknown member is refused');
select lives_ok($$ select public.unblock_member(tests.member_id('member_a')) $$,
  'unblock_member: the Enforcement Committee unblocks');
select lives_ok($$ select public.block_member(tests.member_id('pending'), 'Spam application') $$,
  'block_member: a pending applicant can be blocked');
select lives_ok($$ select public.unblock_member(tests.member_id('pending')) $$,
  'unblock_member: the blocked applicant is unblocked');
select tests.clear_auth();
select is((select status::text || '|' || coalesce(status_reason, '<null>') from public.members
           where id = tests.member_id('member_a')), 'active|<null>',
  'unblocking an approved member makes them active and clears the reason');
select is((select status::text from public.members where id = tests.member_id('pending')), 'pending',
  'unblocking a never-approved applicant returns them to pending, not active');
select is((select count(*)::int from public.audit_log where action = 'member.unblocked'
           and actor_member_id = tests.member_id('enforcement')), 2,
  'unblock_member writes an audit row each time');

-- ===== assign_role =======================================================
select tests.authenticate_as('member_a');
select throws_ok($$ select public.assign_role(tests.member_id('member_b'), 'branch_secretary', tests.branch_id('B')) $$,
  '42501', null, 'assign_role: an ordinary member cannot assign');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'branch_secretary', tests.branch_id('A')) $$,
  '42501', null, 'assign_role: a branch president cannot assign');
select tests.authenticate_as('national_president');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'super_admin') $$, '42501', null,
  'assign_role: a national president cannot make a super admin');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'enforcement_committee') $$, '42501', null,
  'assign_role: a national president cannot assign the Enforcement Committee');
select tests.authenticate_as('mentor');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'super_admin') $$, '42501', null,
  'assign_role: the mentor cannot make a super admin');
select tests.authenticate_as('national_president');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'wizard') $$, '22023', null,
  'assign_role: an unknown role is refused');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'branch_secretary') $$, '23514', null,
  'assign_role: a branch role needs a branch (scope trigger)');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'branch_secretary', tests.branch_id('B')) $$,
  '23514', null, 'assign_role: a branch role is only for a member of that branch');
select throws_ok($$ select public.assign_role(tests.member_id('pending'), 'branch_secretary', tests.branch_id('A')) $$,
  '23514', null, 'assign_role: a pending member cannot hold a role');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'branch_secretary', tests.branch_id('A'),
                      ((now() at time zone 'Asia/Kolkata')::date - 1)) $$,
  '22023', null, 'assign_role: starts_on cannot be in the past');
select lives_ok($$ select public.assign_role(tests.member_id('member_a'), 'branch_secretary', tests.branch_id('A')) $$,
  'assign_role: a national president assigns a branch role');
select throws_ok($$ select public.assign_role(tests.member_id('member_a'), 'branch_secretary', tests.branch_id('A')) $$,
  '23514', null, 'assign_role: an overlapping term of the same role is refused');
select throws_ok($$ select public.assign_role(tests.member_id('national_president'), 'branch_secretary',
                      (select branch_id from public.members where id = tests.member_id('national_president'))) $$,
  '42501', null, 'assign_role: a holder of roles.assign cannot assign a role to themselves');
select tests.clear_auth();
select is((select count(*)::int from public.role_assignments
           where member_id = tests.member_id('member_a') and role_key = 'branch_secretary'
             and branch_id = tests.branch_id('A') and assigned_by = tests.member_id('national_president')
             and starts_on = (now() at time zone 'Asia/Kolkata')::date and ends_on is null), 1,
  'assign_role inserts one assignment starting today');
select is_empty($$ select 1 from public.role_assignments where member_id = tests.member_id('national_president')
                     and role_key = 'branch_secretary' $$,
  'the refused self-assignment created no role assignment');
select isnt_empty($$ select 1 from public.audit_log where action = 'role.assigned'
                     and actor_member_id = tests.member_id('national_president')
                     and details ->> 'role_key' = 'branch_secretary' $$,
  'assign_role writes an audit row');
select tests.authenticate_as('member_a');
select ok(public.has_permission('members.approve', tests.branch_id('A')),
  'the new branch secretary holds members.approve for branch A');

-- ===== end_role ==========================================================
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('member_a', 'branch_secretary')) $$, '42501', null,
  'end_role: a branch president cannot end a role');
select tests.authenticate_as('national_president');
select throws_ok($$ select public.end_role('d0000000-0000-4000-8000-0000000000ff') $$, '22023', null,
  'end_role: an unknown assignment is refused');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('bp_b', 'branch_president'),
                      ((now() at time zone 'Asia/Kolkata')::date - 2)) $$,
  '22023', null, 'end_role: an end date before yesterday is refused');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('super_admin', 'super_admin')) $$, '42501', null,
  'end_role: a national president cannot remove a super admin');
select tests.authenticate_as('mentor');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('super_admin', 'super_admin')) $$, '42501', null,
  'end_role: the mentor cannot remove a super admin');
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('super_admin', 'super_admin')) $$, '23514', null,
  'end_role: the last super admin cannot be removed');
select tests.authenticate_as('national_president');
select lives_ok($$ select public.end_role(tests.p1_00b_ra('member_a', 'branch_secretary')) $$,
  'end_role: a national president ends a role that started today');
select lives_ok($$ select public.end_role(tests.p1_00b_ra('bp_b', 'branch_president')) $$,
  'end_role: a national president ends a branch president''s term');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('bp_b', 'branch_president')) $$, '23514', null,
  'end_role: an assignment that already ended is refused');
select tests.clear_auth();
select is((select count(*)::int from public.role_assignments
           where role_key = 'super_admin' and ends_on is null), 1, 'the refused removal left the super admin in place');
select is_empty($$ select 1 from public.role_assignments
                   where member_id = tests.member_id('member_a') and role_key = 'branch_secretary' $$,
  'an assignment that started today is withdrawn');
select isnt_empty($$ select 1 from public.audit_log where action = 'role.ended'
                     and details ->> 'role_key' = 'branch_secretary' and (details ->> 'withdrawn')::boolean $$,
  'end_role audits the withdrawal');
select is((select ends_on from public.role_assignments where id = tests.p1_00b_ra('bp_b', 'branch_president')),
  (now() at time zone 'Asia/Kolkata')::date - 1, 'end_role sets ends_on to yesterday by default');
select tests.authenticate_as('bp_b');
select ok(not public.has_permission('members.approve', tests.branch_id('B')),
  'the ended branch president no longer holds members.approve');

-- ===== handing super admin over ==========================================
select tests.authenticate_as('super_admin');
select lives_ok($$ select public.assign_role(tests.member_id('national_president'), 'super_admin') $$,
  'assign_role: a super admin with a step-up makes another super admin');
select lives_ok($$ select public.end_role(tests.p1_00b_ra('super_admin', 'super_admin')) $$,
  'end_role: a super admin can step down once another super admin exists');
select tests.clear_auth();
select is((select ends_on from public.role_assignments where id = tests.p1_00b_ra('super_admin', 'super_admin')),
  (now() at time zone 'Asia/Kolkata')::date - 1, 'the first super admin''s term has ended');
select tests.grant_step_up('national_president');
select tests.authenticate_as('national_president');
select throws_ok($$ select public.end_role(tests.p1_00b_ra('national_president', 'super_admin')) $$, '23514', null,
  'end_role: the new sole super admin cannot remove themselves');
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.block_member(tests.member_id('national_president'), 'Harassment') $$, '23514', null,
  'block_member: the new sole super admin cannot be blocked');
select tests.clear_auth();
select is((select count(*)::int from public.role_assignments
           where member_id = tests.member_id('national_president') and role_key = 'super_admin' and ends_on is null), 1,
  'the sole super admin keeps their role');

select * from finish();
rollback;

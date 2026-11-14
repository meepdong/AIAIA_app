-- P1-04 chunk 2: admin_export_members, admin_list_settings / admin_set_setting, admin_set_member_branch.
-- Fixtures: supabase/seeds/p0-02.sql. Added here: a deleted member (…071), a branch A member with
-- no member_private row and so no DOB on record (…072), two test-only branch roles carrying
-- data.export (one with members.approve, one without), notify_dispatch_secret.
begin;
select plan(102);

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

insert into public.roles (key, name, scope) values
  ('test_branch_exporter', 'Test branch exporter', 'branch'),
  ('test_branch_exporter_nc', 'Test branch exporter without approve', 'branch');
insert into public.role_permissions (role_key, permission_key) values
  ('test_branch_exporter', 'data.export'), ('test_branch_exporter', 'members.approve'),
  ('test_branch_exporter_nc', 'data.export');
insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  (tests.member_id('bp_a'), 'test_branch_exporter', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 1),
  (tests.member_id('support_staff'), 'test_branch_exporter_nc', tests.branch_id('B'), (now() at time zone 'Asia/Kolkata')::date - 1);

insert into public.members (id, user_id, full_name, branch_id, wing, status)
values ('a0000000-0000-4000-8000-000000000071', null, 'Priya Demokar', tests.branch_id('A'), 'youth', 'deleted');
insert into public.members (id, user_id, full_name, branch_id, wing, status)
values ('a0000000-0000-4000-8000-000000000072', null, 'Tara Mockford', tests.branch_id('A'), 'youth', 'active');

insert into public.app_settings (key, value, is_public, description)
values ('notify_dispatch_secret', '"test-dispatch-secret"'::jsonb, false, 'test')
on conflict (key) do update set value = excluded.value;
create temp table t_url as select value from public.app_settings where key = 'notify_dispatch_url';

-- ===== execute privileges (independent of the in-body checks) ===============
select ok(not has_function_privilege('anon', 'public.admin_set_member_branch(uuid, uuid)', 'execute'),
  'anon cannot execute admin_set_member_branch');
select ok(not has_function_privilege('anon', 'public.admin_export_members(uuid, integer, uuid)', 'execute'),
  'anon cannot execute admin_export_members');
select ok(not has_function_privilege('anon', 'public.admin_list_settings()', 'execute'),
  'anon cannot execute admin_list_settings');
select ok(not has_function_privilege('anon', 'public.admin_set_setting(text, jsonb)', 'execute'),
  'anon cannot execute admin_set_setting');
select ok(not has_function_privilege('anon', 'public.admin_setting_is_secret(text)', 'execute'),
  'anon cannot execute admin_setting_is_secret');
select ok(not has_function_privilege('authenticated', 'public.admin_setting_is_secret(text)', 'execute'),
  'authenticated cannot execute admin_setting_is_secret');
select ok(not has_function_privilege('anon', 'public.admin_setting_is_locked(text)', 'execute'),
  'anon cannot execute admin_setting_is_locked');
select ok(not has_function_privilege('authenticated', 'public.admin_setting_is_locked(text)', 'execute'),
  'authenticated cannot execute admin_setting_is_locked');

-- ===== admin_export_members: refused ======================================
select tests.as_anon();
select throws_ok($$ select * from public.admin_export_members(null, 10, null) $$, '42501', null,
  'export: anon is refused');
select tests.authenticate_as('pending');
select throws_ok($$ select * from public.admin_export_members(tests.branch_id('A')) $$, '42501', null,
  'export: a pending user is refused');
select tests.authenticate_as('member_a');
select throws_ok($$ select * from public.admin_export_members(tests.branch_id('A')) $$, '42501', null,
  'export: an ordinary member is refused');
select tests.authenticate_as('guardian');
select throws_ok($$ select * from public.admin_export_members(tests.branch_id('A')) $$, '42501', null,
  'export: a guardian is refused');
select tests.authenticate_as('enforcement');
select throws_ok($$ select * from public.admin_export_members() $$, '42501', null,
  'export: the enforcement committee is refused');
select tests.authenticate_as('bp_b');
select throws_ok($$ select * from public.admin_export_members(tests.branch_id('B')) $$, '42501', null,
  'export: a branch president without data.export is refused for their own branch');
select tests.authenticate_as('bp_a');
select throws_ok($$ select * from public.admin_export_members(tests.branch_id('B')) $$, '42501', null,
  'export: a branch-scoped exporter is refused for another branch');
select throws_ok($$ select * from public.admin_export_members() $$, '42501', null,
  'export: a branch-scoped exporter is refused all branches');
select tests.authenticate_as('support_staff');
select throws_ok($$ select * from public.admin_export_members() $$, '42501', null,
  'export: a branch-scoped exporter (support staff) is refused all branches');

-- ===== admin_export_members: branch-scoped exporter =======================
select tests.authenticate_as('bp_a');
select is((select phone from public.admin_export_members(tests.branch_id('A')) where member_id = tests.member_id('member_a')),
  '+919000000009', 'branch exporter with members.approve: an adult''s phone is exported');
select ok((select contacts_withheld and is_minor and phone is null and email is null and dob is null
           from public.admin_export_members(tests.branch_id('A')) where member_id = tests.member_id('minor_16')),
  'branch exporter: a minor''s contact fields are withheld');
select ok((select is_minor and contacts_withheld from public.admin_export_members(tests.branch_id('A'))
           where member_id = tests.member_id('dependent_9')),
  'branch exporter: a dependent minor is withheld too');
select is_empty($$ select 1 from public.admin_export_members(tests.branch_id('A')) where branch_code <> (select code from public.branches where id = tests.branch_id('A')) $$,
  'branch exporter: only the branch asked for is exported');
select is((select is_minor is true and contacts_withheld is true and phone is null and email is null and dob is null
           from public.admin_export_members(tests.branch_id('A')) where member_id = 'a0000000-0000-4000-8000-000000000072'),
  true, 'branch exporter: a member with no DOB on record counts as a minor and is withheld');
select tests.authenticate_as('support_staff');
select ok((select bool_and(contacts_withheld and phone is null and email is null and dob is null) and count(*) > 0
           from public.admin_export_members(tests.branch_id('B'))),
  'exporter without members.approve: every row''s contact fields are withheld');

-- ===== admin_export_members: national exporter ============================
select tests.authenticate_as('national_president');
select ok((select not contacts_withheld and phone = '+919000000012' and dob is not null
           from public.admin_export_members() where member_id = tests.member_id('minor_16')),
  'national exporter: a minor''s contact fields are exported');
select is((select count(*) from public.admin_export_members(null, 500)),
  (select count(*) from public.members where status in ('active', 'pending', 'suspended')),
  'national exporter: every active, pending and suspended member is exported');
select is_empty($$ select 1 from public.admin_export_members() where member_id = 'a0000000-0000-4000-8000-000000000071' $$,
  'a deleted member is not exported');
select isnt_empty($$ select 1 from public.admin_export_members() where member_id = tests.member_id('suspended') and status = 'suspended' $$,
  'a suspended member is exported with their status');
select tests.clear_auth();
insert into t_ids select 'after', id from public.members where status in ('active', 'pending', 'suspended') order by id offset 1 limit 1;
select tests.authenticate_as('national_president');
select results_eq($$ select member_id from public.admin_export_members(null, 2, (select v from t_ids where k = 'after')) $$,
  $$ select id from public.members where status in ('active', 'pending', 'suspended') order by id offset 2 limit 2 $$,
  'export pages by member id after the cursor');
select throws_ok($$ select * from public.admin_export_members(null, 0) $$, '22023', null, 'export: page_size 0 is refused');
select throws_ok($$ select * from public.admin_export_members(null, 501) $$, '22023', null, 'export: page_size 501 is refused');
select throws_ok($$ select * from public.admin_export_members('c0000000-0000-4000-8000-0000000000ff') $$, '22023', null,
  'export: an unknown branch is refused');
select tests.clear_auth();
select is((select count(*)::int from public.audit_log where action = 'members.exported' and actor_member_id = tests.member_id('national_president')),
  5, 'every exported page writes one audit row (5 pages so far)');
select ok((select (details ->> 'rows')::int = 2 and (details ->> 'page_size')::int = 2 and details ->> 'after' is not null
           from public.audit_log where action = 'members.exported' and actor_member_id = tests.member_id('national_president')
             and details ->> 'page_size' = '2'),
  'the audit row records the page size, cursor and row count');
select tests.authenticate_as('mentor');
select lives_ok($$ select * from public.admin_export_members() $$, 'export: the mentor may export every branch');

-- ===== settings: refused ===================================================
select tests.as_anon();
select throws_ok($$ select * from public.admin_list_settings() $$, '42501', null, 'list settings: anon is refused');
select throws_ok($$ select public.admin_set_setting('min_app_version', '"9.9.9"') $$, '42501', null, 'set setting: anon is refused');
select tests.authenticate_as('pending');
select throws_ok($$ select * from public.admin_list_settings() $$, '42501', null, 'list settings: a pending user is refused');
select tests.authenticate_as('member_a');
select throws_ok($$ select * from public.admin_list_settings() $$, '42501', null, 'list settings: an ordinary member is refused');
select tests.authenticate_as('national_president');
select throws_ok($$ select * from public.admin_list_settings() $$, '42501', null, 'list settings: a national officer is refused');
select isnt_empty($$ select 1 from public.app_settings where key = 'min_app_version' $$,
  'precondition: the national officer can see the public min_app_version row');
select throws_ok($$ select public.admin_set_setting('min_app_version', '"9.9.9"') $$, '42501', null,
  'set setting: a national officer is refused');
select tests.authenticate_as('mentor');
select throws_ok($$ select * from public.admin_list_settings() $$, '42501', null, 'list settings: the mentor (no system.config) is refused');
select throws_ok($$ select public.admin_set_setting('min_app_version', '"9.9.9"') $$, '42501', null,
  'set setting: the mentor is refused');
select tests.clear_auth();
select is((select value from public.app_settings where key = 'min_app_version'), '"0.0.0"'::jsonb,
  'the refused setting writes changed nothing');

-- ===== admin_set_member_branch: refused ===================================
select tests.as_anon();
select throws_ok($$ select public.admin_set_member_branch('a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-00000000000b') $$,
  '42501', null, 'set branch: anon is refused');
select tests.authenticate_as('pending');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('B')) $$, '42501', null,
  'set branch: a pending user is refused');
select throws_ok($$ select public.admin_set_member_branch('a0000000-0000-4000-8000-0000000000ff', tests.branch_id('B')) $$, '42501', null,
  'set branch: a pending user gets the same refusal for an unknown member id');
select tests.authenticate_as('member_a');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_b'), tests.branch_id('A')) $$, '42501', null,
  'set branch: an ordinary member is refused');
select throws_ok($$ select public.admin_set_member_branch('a0000000-0000-4000-8000-0000000000ff', tests.branch_id('A')) $$, '42501', null,
  'set branch: an ordinary member gets the same refusal for an unknown member id');
select tests.authenticate_as('guardian');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('dependent_9'), tests.branch_id('B')) $$, '42501', null,
  'set branch: a guardian with an active link is refused');
select tests.clear_auth();
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
where member_id = tests.member_id('turns_18') and guardian_member_id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('turns_18'), tests.branch_id('B')) $$, '42501', null,
  'set branch: a guardian with an ended link is refused');
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('B')) $$, '42501', null,
  'set branch: the enforcement committee is refused');
select tests.authenticate_as('support_staff');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('B')) $$, '42501', null,
  'set branch: support staff are refused');
select tests.authenticate_as('bp_a');
select isnt_empty($$ select 1 from public.members where id = tests.member_id('member_a') $$,
  'precondition: the branch A officer can see member_a');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('B')) $$, '42501', null,
  'set branch: members.manage on the old branch without members.approve on the new one is refused');
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('B')) $$, '42501', null,
  'set branch: members.approve on the new branch without members.manage on the old one is refused');
select tests.authenticate_as('national_president');
select isnt_empty($$ select 1 from public.members where id = tests.member_id('national_president') $$,
  'precondition: the national officer can see their own row');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('national_president'), tests.branch_id('B')) $$, '42501', null,
  'set branch: nobody moves their own member row');
select throws_ok($$ select public.admin_set_member_branch('a0000000-0000-4000-8000-0000000000ff', tests.branch_id('B')) $$, '22023', null,
  'set branch: an unknown member is refused');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), 'c0000000-0000-4000-8000-0000000000ff') $$, '22023', null,
  'set branch: an unknown branch is refused');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('A')) $$, '23514', null,
  'set branch: the current branch is refused');
select throws_ok($$ select public.admin_set_member_branch('a0000000-0000-4000-8000-000000000071', tests.branch_id('B')) $$, '23514', null,
  'set branch: a deleted member cannot be moved');
select tests.clear_auth();
select ok((select branch_id = tests.branch_id('A') from public.members where id = tests.member_id('member_a'))
          and (select branch_id = tests.branch_id('A') from public.members where id = tests.member_id('national_president'))
          and (select branch_id = tests.branch_id('A') from public.members where id = tests.member_id('turns_18')),
  'the refused branch changes changed nothing');

-- ===== admin_set_member_branch: national officer moves member_a A -> B ====
insert into public.role_assignments (member_id, role_key, branch_id, starts_on) values
  (tests.member_id('member_a'), 'branch_secretary', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 30),
  (tests.member_id('member_a'), 'branch_treasurer', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date);
with x as (
  insert into public.branch_transfers (member_id, from_branch_id, to_branch_id, requested_by)
  values (tests.member_id('member_a'), tests.branch_id('A'), tests.branch_id('B'), tests.member_id('member_a')) returning id
)
insert into t_ids select 'tr', id from x;
select tests.authenticate_as('national_president');
select is((public.admin_set_member_branch(tests.member_id('member_a'), tests.branch_id('B')) ->> 'roles_ended')::int, 2,
  'set branch: a national officer moves a member and both old-branch roles end');
select tests.clear_auth();
select is((select branch_id from public.members where id = tests.member_id('member_a')), tests.branch_id('B'), 'the branch changed');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('member_a') and reason = 'branch_change'
                      and changed_by = tests.member_id('national_president') and from_status = 'active' and to_status = 'active' $$,
  'a branch_change status event is written');
select is((select ends_on from public.role_assignments where member_id = tests.member_id('member_a') and role_key = 'branch_secretary'),
  (now() at time zone 'Asia/Kolkata')::date - 1, 'the running old-branch role ends yesterday');
select is_empty($$ select 1 from public.role_assignments where member_id = tests.member_id('member_a') and role_key = 'branch_treasurer' $$,
  'the old-branch role starting today is withdrawn');
select ok((select status = 'cancelled' and decided_by = tests.member_id('national_president') and decided_at is not null
           from public.branch_transfers where id = (select v from t_ids where k = 'tr')),
  'the pending transfer request is cancelled');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.branch_changed' and entity_id = tests.member_id('member_a')::text
                      and actor_member_id = tests.member_id('national_president') and details ->> 'transfers_cancelled' = '1' $$,
  'the branch change is audited');
select is((select count(*)::int from public.audit_log where action = 'role.ended' and details ->> 'reason' = 'branch_change'
             and details ->> 'member_id' = tests.member_id('member_a')::text), 2,
  'each ended role is audited');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('member_a') and kind = 'membership.branch_changed' $$,
  'the member is notified');

-- ===== admin_set_member_branch: branch-scoped and global holders ===========
insert into public.role_assignments (member_id, role_key, branch_id, starts_on)
values (tests.member_id('bp_b'), 'branch_secretary', tests.branch_id('A'), (now() at time zone 'Asia/Kolkata')::date - 1);
select tests.authenticate_as('bp_b');
select lives_ok($$ select public.admin_set_member_branch(tests.member_id('suspended'), tests.branch_id('B')) $$,
  'set branch: members.manage on the old branch plus members.approve on the new one moves a suspended member');
select isnt_empty($$ select 1 from public.members where id = tests.member_id('bp_a') $$,
  'precondition: the branch-scoped officer can see the branch A president');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('bp_a'), tests.branch_id('B')) $$, '42501', null,
  'set branch: without roles.assign, a member holding branch roles is refused');
select tests.clear_auth();
select ok((select branch_id = tests.branch_id('A') from public.members where id = tests.member_id('bp_a'))
          and exists (select 1 from public.role_assignments where member_id = tests.member_id('bp_a')
                        and role_key = 'branch_president' and branch_id = tests.branch_id('A') and ends_on is null),
  'the refused move left the president''s branch and branch_president role unchanged');
select tests.authenticate_as('mentor');
select lives_ok($$ select public.admin_set_member_branch(tests.member_id('member_b'), tests.branch_id('A')) $$,
  'set branch: the mentor moves a member');
select tests.clear_auth();
select ok((select branch_id = tests.branch_id('B') from public.members where id = tests.member_id('suspended'))
          and (select branch_id = tests.branch_id('A') from public.members where id = tests.member_id('member_b')),
  'both allowed moves changed the branch');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('suspended') and kind = 'membership.branch_changed' $$,
  'a moved suspended member is notified');

-- ===== super admin without a step-up ======================================
select tests.authenticate_as('super_admin');
select throws_ok($$ select * from public.admin_export_members() $$, '42501', null, 'export: a super admin without a step-up is refused');
select throws_ok($$ select * from public.admin_list_settings() $$, '42501', null, 'list settings: a super admin without a step-up is refused');
select throws_ok($$ select public.admin_set_setting('min_app_version', '"9.9.9"') $$, '42501', null,
  'set setting: a super admin without a step-up is refused');
select throws_ok($$ select public.admin_set_member_branch(tests.member_id('pending'), tests.branch_id('B')) $$, '42501', null,
  'set branch: a super admin without a step-up is refused');
select tests.clear_auth();
select ok((select value = '"0.0.0"'::jsonb from public.app_settings where key = 'min_app_version')
          and (select branch_id = tests.branch_id('A') from public.members where id = tests.member_id('pending')),
  'the refused super-admin calls changed nothing');

-- ===== super admin with a step-up =========================================
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select lives_ok($$ select * from public.admin_export_members() $$, 'export: a super admin with a step-up may export');
select ok((select value is null and is_secret and not editable from public.admin_list_settings() where key = 'notify_dispatch_secret'),
  'list settings: a secret value is masked and not editable');
select ok((select value is not null and not is_secret and not editable from public.admin_list_settings() where key = 'notify_dispatch_url'),
  'list settings: the dispatch URL is shown but not editable');
select ok((select value = '2000'::jsonb and editable from public.admin_list_settings() where key = 'email_daily_cap'),
  'list settings: an ordinary setting is shown and editable');
select lives_ok($$ select public.admin_set_setting('email_daily_cap', '1500') $$, 'set setting: a super admin with a step-up sets a value');
select throws_ok($$ select public.admin_set_setting('notify_dispatch_secret', '"stolen"') $$, '42501', null,
  'set setting: a secret setting is refused');
select throws_ok($$ select public.admin_set_setting('notify_dispatch_url', '"https://example.invalid/x"') $$, '42501', null,
  'set setting: the dispatch URL is refused');
select throws_ok($$ select public.admin_set_setting('no_such_setting', '1') $$, '22023', null, 'set setting: an unknown key is refused');
select throws_ok($$ select public.admin_set_setting('email_daily_cap', '"lots"') $$, '22023', null,
  'set setting: a value of another JSON type is refused');
select throws_ok($$ select public.admin_set_setting('email_daily_cap', null) $$, '22023', null, 'set setting: an SQL null value is refused');
select throws_ok($$ select public.admin_set_setting('step_up_roles', '["mentor"]') $$, '23514', null,
  'set setting: table checks still apply (step_up_roles keeps super_admin)');
select lives_ok($$ select public.admin_set_setting('trusted_device_days', '30') $$, 'set setting: a null setting may take a number');
select lives_ok($$ select public.admin_set_member_branch(tests.member_id('pending'), tests.branch_id('B')) $$,
  'set branch: a super admin with a step-up moves a pending applicant');
select tests.clear_auth();
select ok((select value = '1500'::jsonb and updated_by = tests.member_id('super_admin') from public.app_settings where key = 'email_daily_cap'),
  'the new value and its author are stored');
select is((select value from public.app_settings where key = 'notify_dispatch_secret'), '"test-dispatch-secret"'::jsonb,
  'the secret setting is unchanged');
select is((select value from public.app_settings where key = 'notify_dispatch_url'), (select value from t_url),
  'the dispatch URL is unchanged');
select isnt_empty($$ select 1 from public.audit_log where action = 'settings.updated' and entity_id = 'email_daily_cap'
                      and actor_member_id = tests.member_id('super_admin') $$,
  'the setting change is audited');
select is((select branch_id from public.members where id = tests.member_id('pending')), tests.branch_id('B'),
  'the pending applicant moved');

select * from finish();
rollback;

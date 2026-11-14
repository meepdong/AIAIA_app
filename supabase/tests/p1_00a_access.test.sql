-- P1-00a check_ins, event_staff, reports, notifications, push_tokens, consent_records, branch_transfers,
-- app_settings and the service-only tables. Event X = 02 (branch A), event Y = 03 (branch B).
begin;
select plan(56);

insert into public.event_staff (event_id, member_id, capabilities) values
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('enforcement'), array['check_in']),
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('turns_35'), array['collect_payments']),
  ('e0000000-0000-4000-8000-000000000003', tests.member_id('support_staff'), array['safety_lead']);
-- The P1-00b age guard cuts guardians off on the ward's 18th birthday. Keep the turns_18 ward a
-- minor (18 tomorrow) here, so the ended-link test below still pins ended_at on its own.
update public.member_private set dob = dob + 1 where member_id = tests.member_id('turns_18');
insert into public.check_ins (event_id, member_id, client_ref) values
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('member_a'), gen_random_uuid()),
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('dependent_9'), gen_random_uuid()),
  ('e0000000-0000-4000-8000-000000000002', tests.member_id('turns_18'), gen_random_uuid()),
  ('e0000000-0000-4000-8000-000000000003', tests.member_id('member_b'), gen_random_uuid()),
  ('e0000000-0000-4000-8000-000000000003', tests.member_id('minor_16'), gen_random_uuid());

-- check_ins
select tests.authenticate_as('enforcement');
select is((select count(*)::int from public.check_ins where event_id = 'e0000000-0000-4000-8000-000000000002'), 3,
  'check_in staff of event X see all of X''s check-ins');
select is((select count(*)::int from public.check_ins where event_id <> 'e0000000-0000-4000-8000-000000000002'), 0,
  'check_in staff of event X see no other event''s check-ins');
select throws_ok($$ insert into public.check_ins (event_id, member_id, client_ref)
  values ('e0000000-0000-4000-8000-000000000002', tests.member_id('member_b'), gen_random_uuid()) $$, '42501', null,
  'staff cannot write check-ins directly');
select tests.authenticate_as('support_staff');
select is((select array_agg(distinct right(event_id::text, 2)) from public.check_ins), array['03'], 'safety_lead staff of Y see Y only');
select tests.authenticate_as('turns_35');
select is_empty($$ select * from public.check_ins $$, 'collect_payments-only staff see no check-ins');
select tests.authenticate_as('bp_a');
select is((select array_agg(distinct right(event_id::text, 2)) from public.check_ins), array['02'], 'branch officer A sees branch A event check-ins only');
select throws_ok($$ delete from public.check_ins $$, '42501', null, 'officers cannot delete check-ins directly');
select tests.authenticate_as('bp_b');
select is((select array_agg(distinct right(event_id::text, 2)) from public.check_ins), array['03'], 'branch officer B sees branch B event check-ins only');
select tests.authenticate_as('member_a');
select results_eq($$ select member_id from public.check_ins $$, $$ select tests.member_id('member_a') $$, 'a member sees only their own check-in');
select tests.authenticate_as('guardian');
select is((select count(*)::int from public.check_ins), 2, 'guardian with active links sees both wards'' check-ins');
select tests.clear_auth();
update public.member_guardians set ended_at = now(), ended_reason = 'turned_18'
where member_id = tests.member_id('turns_18') and guardian_member_id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select results_eq($$ select member_id from public.check_ins $$, $$ select tests.member_id('dependent_9') $$,
  'guardian whose link ended sees none of the former ward''s check-ins');
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('enforcement');
select tests.authenticate_as('enforcement');
select is_empty($$ select * from public.check_ins $$, 'suspended staff see no check-ins');
select is_empty($$ select * from public.event_staff $$, 'suspended staff do not see their staff row');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('enforcement');

-- event_staff
select tests.authenticate_as('bp_a');
select is((select count(*)::int from public.event_staff), 2, 'branch officer A sees event X''s two staff rows only');
select throws_ok($$ insert into public.event_staff (event_id, member_id, capabilities)
  values ('e0000000-0000-4000-8000-000000000002', tests.member_id('member_a'), array['check_in']) $$, '42501', null,
  'officers cannot add staff directly');
select tests.authenticate_as('bp_b');
select results_eq($$ select member_id from public.event_staff $$, $$ select tests.member_id('support_staff') $$, 'branch officer B sees event Y''s staff only');
select tests.authenticate_as('enforcement');
select results_eq($$ select member_id from public.event_staff $$, $$ select tests.member_id('enforcement') $$, 'a staff member sees their own staff row');
select tests.authenticate_as('member_a');
select is_empty($$ select * from public.event_staff $$, 'an ordinary member sees no staff rows');

-- reports
select tests.clear_auth();
insert into public.reports (reporter_member_id, target_type, target_id, reason, resolution_note) values
  (tests.member_id('member_a'), 'announcement', 'd0000000-0000-4000-8000-000000000001', 'spam', 'reviewer note'),
  (tests.member_id('member_b'), 'member', tests.member_id('member_a'), 'abuse', null);
select tests.authenticate_as('member_a');
select is_empty($$ select * from public.reports $$, 'a reporter cannot read the reports table');
select is((select array_agg(status) from public.my_reports()), array['open'], 'my_reports returns only the caller''s report status');
select throws_ok($$ insert into public.reports (reporter_member_id, target_type, target_id, reason)
  values (tests.member_id('member_a'), 'member', tests.member_id('member_b'), 'x') $$, '42501', null, 'reports are inserted via RPC only');
select tests.authenticate_as('enforcement');
select is((select count(*)::int from public.reports), 2, 'reports.review sees every report');
select tests.authenticate_as('bp_a');
select is_empty($$ select * from public.reports $$, 'branch officer without reports.review sees no reports');

-- notifications
select tests.clear_auth();
insert into public.notifications (member_id, kind, title) values
  (tests.member_id('member_a'), 'test', 'For A'), (tests.member_id('member_b'), 'test', 'For B'),
  (tests.member_id('dependent_9'), 'test', 'For ward'), (tests.member_id('turns_18'), 'test', 'For former ward');
select tests.authenticate_as('member_a');
select results_eq($$ select title from public.notifications $$, $$ values ('For A') $$, 'a member sees only their own notifications');
select lives_ok($$ update public.notifications set read_at = now() where title = 'For A' $$, 'a member marks their notification read');
select throws_ok($$ update public.notifications set title = 'x' where title = 'For A' $$, '42501', null, 'a member cannot change other notification columns');
select throws_ok($$ delete from public.notifications $$, '42501', null, 'a member cannot delete notifications');
-- member B's notification is invisible to member A (select policy), so this proves the update touches no row
select tests.authenticate_as('member_a');
select is_empty($$ with u as (update public.notifications set read_at = now() where title = 'For B' returning id) select id from u $$,
  'member A cannot mark member B''s notification read');
select tests.clear_auth();
select is((select read_at from public.notifications where title = 'For B'), null, 'member B''s notification is still unread');
select tests.authenticate_as('guardian');
select results_eq($$ select title from public.notifications $$, $$ values ('For ward') $$, 'guardian sees the active ward''s notifications only');

-- push_tokens
select tests.authenticate_as('member_a');
select lives_ok($$ insert into public.push_tokens (platform, token) values ('android', 'ExponentPushToken[a]') $$, 'a member registers their own token');
select throws_ok($$ insert into public.push_tokens (member_id, platform, token) values (tests.member_id('member_b'), 'android', 'ExponentPushToken[b]') $$,
  '42501', null, 'a member cannot register a token for someone else');
select tests.authenticate_as('member_b');
select is_empty($$ select * from public.push_tokens $$, 'member B cannot see member A''s token');
-- member A's token is invisible to member B (select policy), so these prove neither write touches a row
select is_empty($$ with u as (update public.push_tokens set token = 'ExponentPushToken[hijack]' where token = 'ExponentPushToken[a]' returning id) select id from u $$,
  'member B cannot update member A''s push token');
select is_empty($$ with d as (delete from public.push_tokens where token = 'ExponentPushToken[a]' returning id) select id from d $$,
  'member B cannot delete member A''s push token');
select tests.clear_auth();
select is((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[a]' and member_id = tests.member_id('member_a')), 1,
  'member A''s push token is unchanged and still present');

-- consent_records and branch_transfers
select tests.clear_auth();
insert into public.consent_records (member_id, guardian_name, method) values
  (tests.member_id('dependent_9'), 'Vikram Fixture', 'guardian_account'),
  (tests.member_id('minor_16'), 'Priya Testwala', 'paper_form'),
  (tests.member_id('member_b'), null, 'self_adult');
insert into public.branch_transfers (member_id, from_branch_id, to_branch_id) values
  (tests.member_id('member_a'), tests.branch_id('A'), tests.branch_id('B'));
select tests.authenticate_as('bp_a');
select is((select count(*)::int from public.consent_records), 2, 'branch officer A sees branch A consent records only');
select is((select count(*)::int from public.branch_transfers), 1, 'from-branch officer sees the transfer');
select tests.authenticate_as('bp_b');
select is((select count(*)::int from public.consent_records), 1, 'branch officer B sees branch B consent records only');
select is((select count(*)::int from public.branch_transfers), 1, 'to-branch officer sees the transfer');
select tests.authenticate_as('guardian');
select results_eq($$ select member_id from public.consent_records $$, $$ select tests.member_id('dependent_9') $$, 'guardian sees only the ward''s consent record');
select tests.authenticate_as('member_b');
select is_empty($$ select * from public.branch_transfers $$, 'an unrelated member sees no transfers');
-- A transfer between two other branches (C to D): branch A and B officers have no scope over it
select tests.clear_auth();
insert into public.branches (id, code, name) values
  ('c0000000-0000-4000-8000-00000000000c', 'BC', 'Placeholder Branch C'),
  ('c0000000-0000-4000-8000-00000000000d', 'BD', 'Placeholder Branch D');
insert into public.branch_transfers (member_id, from_branch_id, to_branch_id) values
  (tests.member_id('turns_35'), tests.branch_id('C'), tests.branch_id('D'));
select is((select count(*)::int from public.branch_transfers), 2, 'owner sees both transfers');
select tests.authenticate_as('bp_a');
select is((select count(*)::int from public.branch_transfers where from_branch_id = tests.branch_id('C')), 0,
  'branch officer A does not see a transfer between other branches');
select results_eq($$ select member_id from public.branch_transfers $$, $$ select tests.member_id('member_a') $$,
  'branch officer A still sees their own branch''s transfer');
select tests.authenticate_as('super_admin');
select is_empty($$ select * from public.consent_records $$, 'super admin without a step-up sees no consent records');
select tests.authenticate_as('member_a');
select throws_ok($$ insert into public.branch_transfers (member_id, from_branch_id, to_branch_id)
  values (tests.member_id('member_a'), tests.branch_id('A'), tests.branch_id('B')) $$, '42501', null, 'transfers are written via RPC only');

-- app_settings: public rows only, read-only
select tests.as_anon();
select results_eq($$ select key from public.app_settings order by key $$, $$ values ('grievance_officer'), ('legal_approved'), ('min_app_version') $$,
  'anon reads only the public settings');
select lives_ok($$ select key, value from public.app_settings $$, 'anon can read key and value of public settings');
select throws_ok($$ select updated_by from public.app_settings $$, '42501', null, 'anon cannot read the updated_by column');
select tests.authenticate_as('member_a');
select throws_ok($$ select updated_by from public.app_settings $$, '42501', null, 'members cannot read the updated_by column');
select throws_ok($$ update public.app_settings set value = '[]' where key = 'grievance_officer' $$, '42501', null, 'members cannot change settings');

-- Service-only tables: nobody signed in (even a stepped-up super admin) can read them
select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select throws_ok($$ select * from public.otp_throttle $$, '42501', null, 'stepped-up super admin cannot read otp_throttle');
select throws_ok($$ select * from public.admin_trusted_devices $$, '42501', null, 'nobody can read admin_trusted_devices');
select tests.as_anon();
select throws_ok($$ select * from public.otp_throttle $$, '42501', null, 'anon cannot read otp_throttle');
select tests.authenticate_as('member_a');
select ok(not has_sequence_privilege('authenticated', 'public.member_no_seq', 'usage')
  and not has_table_privilege('authenticated', 'public.email_verifications', 'select'),
  'clients cannot use member_no_seq or read email_verifications');

select tests.clear_auth();
select * from finish();
rollback;

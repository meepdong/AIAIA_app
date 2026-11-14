-- P1-00b chunk 1: submit_application, approve_member, reject_member, request_info, my_profile.
-- Fixtures: supabase/seeds/p0-02.sql (bp_a holds branch_president for A, bp_b for B; pending 11 is
-- in A; pending_36 is in B, wing aiaia). Extra applicants are created below as postgres, ids 40-46
-- (unused elsewhere under supabase/), phones +919000000040..047.
begin;
select plan(66);

create function pg_temp.auth_uid(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'aud', 'authenticated',
    'session_id', md5('session:' || uid::text)::uuid)::text, true);
end;
$$;

-- Logins: 40 (B applicant), 41 (16-year-old), 43 and 44 (no member row yet), 45 (A applicant), 46 (13)
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('b0000000-0000-4000-8000-0000000000' || right(v.phone, 2))::uuid,
       'authenticated', 'authenticated', ltrim(v.phone, '+'), now(), '{}', '{}', now(), now()
from (values ('+919000000040'), ('+919000000041'), ('+919000000043'), ('+919000000044'), ('+919000000045'), ('+919000000046')) v (phone);

insert into public.members (id, user_id, full_name, branch_id, wing, status) values
  ('a0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000040', 'Kabir Testwala', tests.branch_id('B'), 'youth', 'pending'),
  ('a0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000041', 'Diya Sampleton', tests.branch_id('A'), 'youth', 'pending'),
  ('a0000000-0000-4000-8000-000000000042', null, 'Rohan Examplar', tests.branch_id('A'), 'youth', 'pending'),
  ('a0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000045', 'Zoya Placeholder', tests.branch_id('A'), 'youth', 'pending'),
  ('a0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000046', 'Ravi Mockford', tests.branch_id('A'), 'youth', 'pending');
insert into public.member_private (member_id, phone, dob) values
  ('a0000000-0000-4000-8000-000000000040', '+919000000040', ((now() at time zone 'Asia/Kolkata')::date - interval '25 years')::date),
  ('a0000000-0000-4000-8000-000000000041', '+919000000041', ((now() at time zone 'Asia/Kolkata')::date - interval '16 years 30 days')::date),
  ('a0000000-0000-4000-8000-000000000042', null, ((now() at time zone 'Asia/Kolkata')::date - interval '10 years')::date),
  ('a0000000-0000-4000-8000-000000000045', '+919000000045', ((now() at time zone 'Asia/Kolkata')::date - interval '30 years')::date),
  ('a0000000-0000-4000-8000-000000000046', '+919000000046', ((now() at time zone 'Asia/Kolkata')::date - interval '13 years')::date);
insert into public.member_guardians (member_id, guardian_member_id, relationship)
values ('a0000000-0000-4000-8000-000000000042', tests.member_id('guardian'), 'parent');

-- m2/m7 fixtures: 62 is a 15-year-old with their own login and an active guardian link (from bp_b);
-- 48 is a suspended guardian and 49 a 10-year-old dependent whose only active link is to 48.
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000062',
        'authenticated', 'authenticated', '919000000062', now(), '{}', '{}', now(), now());
insert into public.members (id, user_id, full_name, branch_id, wing, status) values
  ('a0000000-0000-4000-8000-000000000062', 'b0000000-0000-4000-8000-000000000062', 'Meera Fixture', tests.branch_id('A'), 'youth', 'pending'),
  ('a0000000-0000-4000-8000-000000000048', null, 'Neil Fixture', tests.branch_id('A'), 'youth', 'suspended'),
  ('a0000000-0000-4000-8000-000000000049', null, 'Nina Fixture', tests.branch_id('A'), 'youth', 'pending');
insert into public.member_private (member_id, phone, dob) values
  ('a0000000-0000-4000-8000-000000000062', '+919000000062', ((now() at time zone 'Asia/Kolkata')::date - interval '15 years 40 days')::date),
  ('a0000000-0000-4000-8000-000000000048', null, ((now() at time zone 'Asia/Kolkata')::date - interval '40 years')::date),
  ('a0000000-0000-4000-8000-000000000049', null, ((now() at time zone 'Asia/Kolkata')::date - interval '10 years')::date);
insert into public.member_guardians (member_id, guardian_member_id, relationship) values
  ('a0000000-0000-4000-8000-000000000062', tests.member_id('bp_b'), 'parent'),
  ('a0000000-0000-4000-8000-000000000049', 'a0000000-0000-4000-8000-000000000048', 'parent');

-- ===== request_info ======================================================
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.request_info(tests.member_id('pending'), 'Please add your city') $$, '42501', null,
  'request_info: a branch B officer cannot ask a branch A applicant');
select throws_ok($$ select public.request_info(tests.member_id('pending_36'), 'Please add your city') $$, '42501', null,
  'request_info: a branch officer cannot ask an AIAIA-wing applicant, even in their own branch');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.request_info(tests.member_id('pending'), '  ') $$, '22023', null,
  'request_info: an empty message is refused');
select lives_ok($$ select public.request_info(tests.member_id('pending'), 'Please add your city') $$,
  'request_info: a branch A officer asks a branch A applicant');
select tests.clear_auth();
select is((select status::text from public.members where id = tests.member_id('pending')), 'pending',
  'request_info leaves the member pending');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('pending')
                     and kind = 'membership.info_requested' and priority = 'high'
                     and body not like '%city%' and data ->> 'message' = 'Please add your city' $$,
  'request_info notifies the applicant; the officer text is in data only, never in the body');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.info_requested'
                     and entity_id = tests.member_id('pending')::text and actor_member_id = tests.member_id('bp_a') $$,
  'request_info writes an audit row');

-- ===== reject_member =====================================================
select tests.authenticate_as('member_a');
select throws_ok($$ select public.reject_member('a0000000-0000-4000-8000-000000000045', 'Incomplete') $$, '42501', null,
  'reject_member: an ordinary member cannot reject');
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.reject_member('a0000000-0000-4000-8000-000000000045', 'Incomplete') $$, '42501', null,
  'reject_member: a branch B officer cannot reject a branch A applicant');
select throws_ok($$ select public.reject_member(tests.member_id('pending_36'), 'Incomplete') $$, '42501', null,
  'reject_member: a branch officer cannot reject an AIAIA-wing applicant, even in their own branch');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.reject_member('a0000000-0000-4000-8000-000000000045', '') $$, '22023', null,
  'reject_member: a reason is required');
select tests.clear_auth();
select is((select count(*)::int from public.members
           where id in ('a0000000-0000-4000-8000-000000000045', tests.member_id('pending_36')) and status = 'pending'), 2,
  'the refused rejections changed nothing');
select tests.authenticate_as('bp_a');
select lives_ok($$ select public.reject_member('a0000000-0000-4000-8000-000000000045', 'Incomplete details') $$,
  'reject_member: a branch A officer rejects a branch A applicant');
select tests.clear_auth();
select ok(exists (select 1 from public.members where id = 'a0000000-0000-4000-8000-000000000045'
                  and status = 'rejected' and status_reason = 'Incomplete details'),
  'reject_member sets status rejected and the reason');
select isnt_empty($$ select 1 from public.member_status_events where member_id = 'a0000000-0000-4000-8000-000000000045'
                     and from_status = 'pending' and to_status = 'rejected' and changed_by = tests.member_id('bp_a') $$,
  'reject_member writes a status event');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.rejected'
                     and entity_id = 'a0000000-0000-4000-8000-000000000045' and actor_member_id = tests.member_id('bp_a') $$,
  'reject_member writes an audit row');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000045') $$, '23514', null,
  'approve_member: a rejected member cannot be approved');

-- ===== approve_member: permission and branch ============================
select tests.authenticate_as('member_a');
select throws_ok($$ select public.approve_member(tests.member_id('pending')) $$, '42501', null,
  'approve_member: an ordinary member cannot approve');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000040') $$, '42501', null,
  'approve_member: branch president A cannot approve a branch B applicant');
select tests.clear_auth();
select is((select count(*)::int from public.members
           where id in (tests.member_id('pending'), 'a0000000-0000-4000-8000-000000000040')
             and status = 'pending' and member_no is null), 2,
  'the refused approvals changed nothing');

select tests.authenticate_as('bp_a');
select lives_ok($$ select public.approve_member(tests.member_id('pending')) $$,
  'approve_member: branch president A approves a branch A applicant');
select tests.clear_auth();
select ok(exists (select 1 from public.members where id = tests.member_id('pending') and status = 'active'
                  and member_no ~ '^AIAIA-Y-[0-9]{6}$' and approved_by = tests.member_id('bp_a') and approved_at is not null),
  'the approved youth member is active with an AIAIA-Y member number');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('pending')
                     and from_status = 'pending' and to_status = 'active' and changed_by = tests.member_id('bp_a') $$,
  'approve_member writes a status event');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('pending')
                     and kind = 'membership.approved' and priority = 'high' $$,
  'approve_member sends a high-priority notification to the member');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.approved'
                     and entity_id = tests.member_id('pending')::text and actor_member_id = tests.member_id('bp_a') $$,
  'approve_member writes an audit row');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.approve_member(tests.member_id('pending')) $$, '23514', null,
  'approve_member: an active member cannot be approved again');

select tests.authenticate_as('national_president');
select lives_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000040') $$,
  'approve_member: a national approver approves an applicant in any branch');
select tests.clear_auth();
select is((select count(distinct member_no)::int from public.members
           where id in (tests.member_id('pending'), 'a0000000-0000-4000-8000-000000000040') and member_no is not null), 2,
  'two approvals produce two distinct member numbers');

-- ===== approve_member: AIAIA wing =======================================
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.approve_member(tests.member_id('pending_36')) $$, '42501', null,
  'approve_member: a branch president cannot approve a 36-year-old (AIAIA wing) in their own branch');
select tests.clear_auth();
select is((select status::text from public.members where id = tests.member_id('pending_36')), 'pending',
  'the refused AIAIA-wing approval changed nothing');
select tests.authenticate_as('national_president');
select lives_ok($$ select public.approve_member(tests.member_id('pending_36')) $$,
  'approve_member: a national approver approves a 36-year-old');
select tests.clear_auth();
select ok((select member_no ~ '^AIAIA-A-[0-9]{6}$' from public.members where id = tests.member_id('pending_36')),
  'an AIAIA-wing member gets an AIAIA-A member number');

-- ===== approve_member: minors ===========================================
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000041') $$, '23514', null,
  'approve_member: a 16-year-old with their own login cannot be approved without consent');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000041',
                     '{"method": "guardian_account", "guardian_name": "Asha Sampleton", "guardian_phone": "+919000000047", "guardian_alerts": true}') $$,
  '22023', null, 'approve_member: a consent object with an invalid method is refused');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000041',
                     '{"method": "paper_form", "guardian_name": "Asha Sampleton", "guardian_phone": "+919000000047"}') $$,
  '22023', null, 'approve_member: a consent object without guardian_alerts is refused');
select tests.clear_auth();
select ok((select status = 'pending' and member_no is null from public.members where id = 'a0000000-0000-4000-8000-000000000041')
          and not exists (select 1 from public.consent_records where member_id = 'a0000000-0000-4000-8000-000000000041'),
  'the refused minor approvals changed nothing and wrote no consent');
select tests.authenticate_as('bp_a');
select lives_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000041',
                    '{"method": "paper_form", "guardian_name": "Asha Sampleton", "guardian_phone": "+919000000047", "guardian_alerts": true}') $$,
  'approve_member: a 16-year-old is approved with a consent object');
select tests.clear_auth();
select ok(exists (select 1 from public.consent_records where member_id = 'a0000000-0000-4000-8000-000000000041'
                  and method = 'paper_form' and guardian_name = 'Asha Sampleton' and guardian_phone = '+919000000047'
                  and guardian_alerts and attested_by = tests.member_id('bp_a')),
  'the consent row exists with the method, guardian and guardian_alerts');
select is((select status::text from public.members where id = 'a0000000-0000-4000-8000-000000000041'), 'active',
  'the consented 16-year-old is active');

select tests.authenticate_as('bp_a');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000046',
                     '{"method": "paper_form", "guardian_name": "Asha Mockford", "guardian_phone": "+919000000047", "guardian_alerts": true}') $$,
  '23514', null, 'approve_member: a 13-year-old with their own login cannot be approved, even with consent');

select lives_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000042') $$,
  'approve_member: a dependent is approved without a consent object');
select tests.clear_auth();
select ok(exists (select 1 from public.consent_records where member_id = 'a0000000-0000-4000-8000-000000000042'
                  and method = 'guardian_account' and guardian_name = 'Vikram Fixture' and not guardian_alerts),
  'a dependent''s consent is recorded as guardian_account for the guardian');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('guardian')
                     and kind = 'membership.approved' and priority = 'high'
                     and data ->> 'member_id' = 'a0000000-0000-4000-8000-000000000042' $$,
  'a dependent''s approval notifies the guardian');
select is_empty($$ select 1 from public.notifications where member_id = 'a0000000-0000-4000-8000-000000000042' $$,
  'a dependent without a login gets no notification row of their own');
select is((select count(*)::int from public.audit_log where action = 'member.approved'
           and entity_id in (tests.member_id('pending')::text, 'a0000000-0000-4000-8000-000000000040',
                             tests.member_id('pending_36')::text, 'a0000000-0000-4000-8000-000000000041',
                             'a0000000-0000-4000-8000-000000000042')), 5,
  'each of the five approvals wrote one audit row');

-- ===== submit_application ===============================================
select tests.as_anon();
select throws_ok($$ select public.submit_application('{}') $$, '42501', null, 'anon cannot call submit_application');
select tests.clear_auth();
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000043');
select is(public.my_profile(), null, 'my_profile is null for a signed-in user without a member row');
select throws_ok(format($$ select public.submit_application('{"full_name": "Tara Demokar", "dob": "%s", "branch_id": "c0000000-0000-4000-8000-0000000000ff"}') $$,
                        ((now() at time zone 'Asia/Kolkata')::date - interval '20 years')::date),
  '22023', null, 'submit_application refuses an unknown branch');
select is(public.submit_application(jsonb_build_object(
            'full_name', 'Tara Demokar', 'dob', ((now() at time zone 'Asia/Kolkata')::date - interval '20 years')::date,
            'branch_id', tests.branch_id('A'), 'city', 'Pune', 'email', 'tara@example.com', 'whatsapp_opt_in', true,
            'privacy', jsonb_build_object('show_city', false, 'show_phone', 'yes', 'other', true))) ->> 'fast_track',
  'false', 'submit_application creates an application; no roster match means no fast track');
select tests.clear_auth();
select ok(exists (select 1 from public.members m join public.member_private p on p.member_id = m.id
                  where m.user_id = 'b0000000-0000-4000-8000-000000000043' and m.status = 'pending' and m.wing = 'youth'
                    and m.branch_id = tests.branch_id('A') and m.member_no is null and m.privacy = '{"show_city": false}'::jsonb
                    and p.phone = '+919000000043' and p.email = 'tara@example.com' and (p.notify_prefs ->> 'whatsapp')::boolean),
  'the application is pending in wing youth, with the login''s phone and only known boolean privacy keys');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000043');
select lives_ok(format($$ select public.submit_application('{"full_name": "Tara Sampleton", "dob": "%s", "branch_id": "%s"}') $$,
                       ((now() at time zone 'Asia/Kolkata')::date - interval '20 years')::date, tests.branch_id('B')),
  'submit_application updates a pending application');
select tests.clear_auth();
select ok((select count(*) = 1 and bool_and(m.full_name = 'Tara Sampleton' and m.branch_id = tests.branch_id('B') and m.status = 'pending')
           from public.members m where m.user_id = 'b0000000-0000-4000-8000-000000000043'),
  'the resubmission updated the one row in place');
select is((select count(*)::int from public.audit_log a join public.members m on a.entity_id = m.id::text
           where m.user_id = 'b0000000-0000-4000-8000-000000000043' and a.action = 'member.application_submitted'), 2,
  'each submission writes an audit row');

insert into public.roster_entries (branch_id, full_name, phone) values (tests.branch_id('A'), 'Samir Dummyson', '+919000000044');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000044');
select is(public.submit_application(jsonb_build_object(
            'full_name', 'Samir Dummyson', 'dob', ((now() at time zone 'Asia/Kolkata')::date - interval '36 years')::date,
            'branch_id', tests.branch_id('A'))) - 'member_id',
  jsonb_build_object('status', 'pending', 'wing', 'aiaia', 'fast_track', true),
  'a 36-year-old with a roster match gets wing aiaia and fast_track, and stays pending');
select throws_ok(format($$ select public.submit_application('{"full_name": "Samir Dummyson", "dob": "%s", "branch_id": "%s"}') $$,
                        ((now() at time zone 'Asia/Kolkata')::date - interval '13 years')::date, tests.branch_id('A')),
  '23514', null, 'submit_application refuses an under-14');
select tests.authenticate_as('member_a');
select throws_ok(format($$ select public.submit_application('{"full_name": "Arjun Testwala", "dob": "%s", "branch_id": "%s"}') $$,
                        ((now() at time zone 'Asia/Kolkata')::date - interval '22 years')::date, tests.branch_id('A')),
  '23514', null, 'submit_application refuses an active member (no self-demotion to pending)');
select tests.clear_auth();
select is((select status::text from public.members where id = tests.member_id('member_a')), 'active',
  'the refused submission left the active member unchanged');

-- ===== my_profile =======================================================
select tests.as_anon();
select throws_ok($$ select public.my_profile() $$, '42501', null, 'anon cannot call my_profile');
select tests.authenticate_as('member_a');
select ok((select p -> 'member' ->> 'id' = tests.member_id('member_a')::text
                  and p -> 'private' ->> 'phone' = '+919000000009' and p -> 'dependents' = '[]'::jsonb
           from public.my_profile() p),
  'my_profile returns the caller''s members and member_private rows');
select tests.authenticate_as('guardian');
select is((select array_agg(d ->> 'id' order by d ->> 'id') from jsonb_array_elements(public.my_profile() -> 'dependents') d),
  array[tests.member_id('dependent_9')::text, 'a0000000-0000-4000-8000-000000000042'],
  'my_profile lists the guardian''s minor dependents only (not the 18-year-old or the adult past the grace period)');

select tests.clear_auth();
-- ===== m2: a dependent cannot rewrite their own DOB ======================
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000062');
select ok(exists (select 1 from public.members where user_id = 'b0000000-0000-4000-8000-000000000062' and status = 'pending'),
  'm2 precondition: the dependent can see their own pending row');
select throws_ok(format($$ select public.submit_application('{"full_name": "Meera Fixture", "dob": "%s", "branch_id": "%s"}') $$,
                        ((now() at time zone 'Asia/Kolkata')::date - interval '25 years')::date, tests.branch_id('A')),
  '42501', null, 'submit_application: a dependent with an active guardian link cannot change their DOB');
select tests.clear_auth();
select is((select dob from public.member_private where member_id = 'a0000000-0000-4000-8000-000000000062'),
  ((now() at time zone 'Asia/Kolkata')::date - interval '15 years 40 days')::date,
  'the refused DOB change left the stored DOB unchanged');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000062');
select lives_ok(format($$ select public.submit_application('{"full_name": "Meera Fixture", "dob": "%s", "branch_id": "%s"}') $$,
                       ((now() at time zone 'Asia/Kolkata')::date - interval '15 years 40 days')::date, tests.branch_id('A')),
  'submit_application: the same DOB still succeeds for a dependent');
select tests.clear_auth();

-- ===== m7: a suspended guardian does not count ===========================
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.approve_member('a0000000-0000-4000-8000-000000000049') $$, '23514', null,
  'approve_member: a 10-year-old whose only active link is to a suspended guardian is refused');
select tests.clear_auth();
select ok((select status = 'pending' from public.members where id = 'a0000000-0000-4000-8000-000000000049')
          and not exists (select 1 from public.consent_records where member_id = 'a0000000-0000-4000-8000-000000000049'),
  'the refused approval left the dependent pending with no consent row');

select * from finish();
rollback;

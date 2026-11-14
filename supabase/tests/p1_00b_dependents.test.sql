-- P1-00b chunk 3: add_dependent, create_claim_code, graduate_dependent, my_dependents, delete_my_account.
-- Fixtures: supabase/seeds/p0-02.sql (guardian 13 is an active adult whose only active minor ward is
-- dependent_9; pending 11; super_admin 1 is the only super admin). Created below as postgres:
-- 51 an active 17-year-old with a login; 52 and 54 logins with no member row (phones +919000000051/052/054).
begin;
select plan(36);

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

insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('b0000000-0000-4000-8000-0000000000' || right(v.phone, 2))::uuid,
       'authenticated', 'authenticated', ltrim(v.phone, '+'), now(), '{}', '{}', now(), now()
from (values ('+919000000051'), ('+919000000052'), ('+919000000054')) v (phone);
insert into public.members (id, user_id, full_name, branch_id, wing, status) values
  ('a0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-000000000051', 'Diya Sampleton', tests.branch_id('A'), 'youth', 'active');
insert into public.member_private (member_id, phone, dob) values
  ('a0000000-0000-4000-8000-000000000051', '+919000000051', ((now() at time zone 'Asia/Kolkata')::date - interval '17 years 200 days')::date);

create temp table t_ids (k text primary key, v text);
grant all on t_ids to authenticated;

-- ===== add_dependent: refused callers ====================================
select tests.authenticate_as('pending');
select throws_ok($$ select public.add_dependent('{"full_name":"Rohan Examplar","dob":"2016-01-01"}') $$, '42501', null,
  'add_dependent: a pending caller is refused');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000051');
select throws_ok($$ select public.add_dependent('{"full_name":"Rohan Examplar","dob":"2016-01-01"}') $$, '42501', null,
  'add_dependent: an active 17-year-old is refused');
select tests.as_anon();
select throws_ok($$ select public.add_dependent('{"full_name":"Rohan Examplar","dob":"2016-01-01"}') $$, '42501', null,
  'add_dependent: anon is refused');
select tests.clear_auth();
select is((select count(*)::int from public.members where full_name = 'Rohan Examplar'), 0,
  'the refused calls created nothing');

-- ===== add_dependent: an active adult =====================================
select tests.authenticate_as('guardian');
select throws_ok($$ select public.add_dependent(jsonb_build_object('full_name', 'Rohan Examplar',
                    'dob', ((now() at time zone 'Asia/Kolkata')::date - interval '19 years')::date)) $$, '22023', null,
  'add_dependent: a dependent must be under 18');
select throws_ok($$ select public.add_dependent('{"full_name":"","dob":"2016-01-01"}') $$, '22023', null,
  'add_dependent: a name is required');
select lives_ok($$ insert into t_ids select 'dep', public.add_dependent(jsonb_build_object('full_name', 'Rohan Examplar',
                   'dob', ((now() at time zone 'Asia/Kolkata')::date - interval '15 years')::date, 'relationship', 'parent')) ->> 'member_id' $$,
  'add_dependent: an active adult adds a 15-year-old dependent');
select tests.clear_auth();
select ok((select status = 'pending' and user_id is null and branch_id = tests.branch_id('A') and wing = 'youth'
           from public.members where id = (select v::uuid from t_ids where k = 'dep')),
  'the dependent is pending, without a login, in the guardian''s branch');
select ok((select phone is null from public.member_private where member_id = (select v::uuid from t_ids where k = 'dep')),
  'the dependent has no phone');
select isnt_empty($$ select 1 from public.member_guardians where member_id = (select v::uuid from t_ids where k = 'dep')
                     and guardian_member_id = tests.member_id('guardian') and ended_at is null $$,
  'an active guardian link exists');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.dependent_added'
                     and entity_id = (select v from t_ids where k = 'dep') and actor_member_id = tests.member_id('guardian') $$,
  'add_dependent writes audit_log');

-- ===== my_dependents =======================================================
select tests.authenticate_as('guardian');
select results_eq($$ select member_id from public.my_dependents() order by member_id $$,
  $$ select x from (values (tests.member_id('dependent_9')), ((select v::uuid from t_ids where k = 'dep'))) v (x) order by x $$,
  'my_dependents lists current wards only (not the 18-year-old or the adult past grace)');
select tests.authenticate_as('member_a');
select is_empty($$ select 1 from public.my_dependents() $$, 'my_dependents is empty for a member with no wards');

-- ===== create_claim_code ===================================================
select throws_ok($$ select public.create_claim_code((select v::uuid from t_ids where k = 'dep')) $$, '42501', null,
  'create_claim_code: a non-guardian is refused');
select tests.authenticate_as('guardian');
select throws_ok($$ select public.create_claim_code(tests.member_id('dependent_9')) $$, '23514', null,
  'create_claim_code: a dependent under 14 is refused');
select lives_ok($$ insert into t_ids select 'code', public.create_claim_code((select v::uuid from t_ids where k = 'dep')) ->> 'code' $$,
  'create_claim_code: the guardian creates a code for a 15-year-old');
select tests.clear_auth();
select ok((select v ~ '^[A-HJ-NP-Z2-9]{8}$' from t_ids where k = 'code'), 'the code has 8 characters from the 32-symbol alphabet');
select ok((select code_hash = encode(extensions.digest((select v from t_ids where k = 'code'), 'sha256'), 'hex')
                  and code_hash <> (select v from t_ids where k = 'code')
                  and expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
           from public.dependent_claims where dependent_id = (select v::uuid from t_ids where k = 'dep')),
  'only the sha256 of the code is stored, expiring in 7 days');

-- ===== graduate_dependent ==================================================
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000052');
select throws_ok($$ select public.graduate_dependent('ZZZZZZ') $$, '22023', null,
  'graduate_dependent: a malformed code is refused');
select is(public.graduate_dependent('ZZZZZZZZ'), '{"ok": false, "error": "invalid_code"}'::jsonb,
  'graduate_dependent: a wrong code returns ok false');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000051');
select throws_ok($$ select public.graduate_dependent((select v from t_ids where k = 'code')) $$, '23514', null,
  'graduate_dependent: a login that already belongs to a member is refused');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000052');
select lives_ok($$ select public.graduate_dependent(lower((select v from t_ids where k = 'code'))) $$,
  'graduate_dependent: the dependent redeems the code with their own login');
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000054');
select is(public.graduate_dependent((select v from t_ids where k = 'code')) ->> 'error', 'invalid_code',
  'graduate_dependent: a used code is refused');
select tests.clear_auth();
select ok((select m.user_id = 'b0000000-0000-4000-8000-000000000052' and p.phone = '+919000000052' and not m.adult_consent_required
           from public.members m join public.member_private p on p.member_id = m.id
           where m.id = (select v::uuid from t_ids where k = 'dep')),
  'the login and phone are attached; a 15-year-old needs no adult consent');
select isnt_empty($$ select 1 from public.member_guardians where member_id = (select v::uuid from t_ids where k = 'dep') and ended_at is null $$,
  'a 15-year-old keeps the guardian link');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('guardian') and kind = 'membership.dependent_claimed' $$,
  'the guardian is told the dependent took over the account');

-- ===== delete_my_account ===================================================
select tests.authenticate_as('guardian');
select throws_ok($$ select public.delete_my_account() $$, '23514', null,
  'delete_my_account: refused while a dependent has no other guardian');
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.delete_my_account() $$, '23514', null,
  'delete_my_account: the last super admin is refused');
select tests.as_anon();
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'delete_my_account: anon is refused');
select tests.clear_auth();
select is((select count(*)::int from public.members
           where id in (tests.member_id('guardian'), tests.member_id('super_admin')) and status = 'active'), 2,
  'the refused deletions changed nothing');

-- A second active guardian for both minor wards lets the first one go. turns_18 and dependent_adult
-- still have active links from the guardian, but are no longer dependents, so they do not block.
insert into public.member_guardians (member_id, guardian_member_id, relationship)
values (tests.member_id('dependent_9'), tests.member_id('member_b'), 'aunt');
select tests.authenticate_as('guardian');
select throws_ok($$ select public.delete_my_account() $$, '23514', null,
  'delete_my_account: still refused while one dependent (now with a login) has no other guardian');
select tests.clear_auth();
insert into public.member_guardians (member_id, guardian_member_id, relationship)
values ((select v::uuid from t_ids where k = 'dep'), tests.member_id('member_b'), 'aunt');
select tests.authenticate_as('guardian');
select lives_ok($$ select public.delete_my_account() $$,
  'delete_my_account: allowed once every dependent has another active guardian');
select tests.clear_auth();
select ok((select status = 'deleted' and status_changed_at > now() - interval '1 minute'
           from public.members where id = tests.member_id('guardian')),
  'the account is deleted with status_changed_at set');
select is((select count(*)::int from public.member_guardians where guardian_member_id = tests.member_id('guardian') and ended_at is null), 0,
  'the deleted member''s guardian links end');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('guardian')
                     and to_status = 'deleted' and reason = 'self_deleted' $$,
  'delete_my_account writes member_status_events');
select isnt_empty($$ select 1 from public.audit_log where action = 'member.self_deleted' and entity_id = tests.member_id('guardian')::text $$,
  'delete_my_account writes audit_log');

select * from finish();
rollback;

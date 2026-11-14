-- P1-00b chunk 3: claim codes. graduate_dependent's rate limit (claim_attempts), expiry, adult claim
-- and age check; create_claim_code's "already has a login" check.
-- Fixtures: supabase/seeds/p0-02.sql (guardian 13; dependent_9, 9 years old, no login; minor_16 with
-- her own login). Created below as postgres:
--   55 a pending 15-year-old dependent without a login, ward of guardian 13
--   58 an active dependent without a login who turned 18 ten days ago, ward of guardian 13
--   56, 57, 59, 60, 61 logins with no member row (phones +919000000056/057/059/060/061)
begin;
select plan(23);

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
from (values ('+919000000056'), ('+919000000057'), ('+919000000059'), ('+919000000060'), ('+919000000061')) v (phone);
insert into public.members (id, user_id, full_name, branch_id, wing, status) values
  ('a0000000-0000-4000-8000-000000000055', null, 'Kabir Testwala', tests.branch_id('A'), 'youth', 'pending'),
  ('a0000000-0000-4000-8000-000000000058', null, 'Meera Mockford', tests.branch_id('A'), 'youth', 'active');
insert into public.member_private (member_id, phone, dob) values
  ('a0000000-0000-4000-8000-000000000055', null, ((now() at time zone 'Asia/Kolkata')::date - interval '15 years')::date),
  ('a0000000-0000-4000-8000-000000000058', null, ((now() at time zone 'Asia/Kolkata')::date - interval '18 years 10 days')::date);
insert into public.member_guardians (member_id, guardian_member_id, relationship) values
  ('a0000000-0000-4000-8000-000000000055', tests.member_id('guardian'), 'parent'),
  ('a0000000-0000-4000-8000-000000000058', tests.member_id('guardian'), 'parent');
-- Codes for dependents create_claim_code would refuse (18+ outside is_guardian_of; under 14).
insert into public.dependent_claims (dependent_id, code_hash, expires_at) values
  ('a0000000-0000-4000-8000-000000000058', encode(extensions.digest('ADULT234'::text, 'sha256'), 'hex'), now() + interval '1 day'),
  (tests.member_id('dependent_9'), encode(extensions.digest('YOUNG234'::text, 'sha256'), 'hex'), now() + interval '1 day');

create temp table t_ids (k text primary key, v text);
grant all on t_ids to authenticated;

-- ===== create_claim_code: a dependent who already has a login ================
-- minor_16 (16, own login) becomes a ward of guardian 13, so is_guardian_of holds.
insert into public.member_guardians (member_id, guardian_member_id, relationship)
values (tests.member_id('minor_16'), tests.member_id('guardian'), 'parent');
select tests.authenticate_as('guardian');
select throws_ok($$ select public.create_claim_code(tests.member_id('minor_16')) $$, '23514', null,
  'create_claim_code: refused for a dependent who already has a login');
select tests.clear_auth();
select is_empty($$ select 1 from public.dependent_claims where dependent_id = tests.member_id('minor_16') $$,
  'no code exists for the dependent with a login');

select tests.authenticate_as('guardian');
select lives_ok($$ insert into t_ids select 'code', public.create_claim_code('a0000000-0000-4000-8000-000000000055') ->> 'code' $$,
  'create_claim_code: the guardian creates a code for the 15-year-old');
select tests.clear_auth();
select ok((select length(v) = 8 from t_ids where k = 'code'), 'the code is 8 characters long');

-- ===== a wrong code records one miss =========================================
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000057');
select is(public.graduate_dependent('ZZZZZZZZ'), '{"ok": false, "error": "invalid_code"}'::jsonb,
  'graduate_dependent: a wrong code returns ok false with invalid_code');
select tests.clear_auth();
select is((select count(*)::int from public.claim_attempts where user_id = 'b0000000-0000-4000-8000-000000000057'), 1,
  'the wrong code writes exactly one claim_attempts row');

-- ===== expiry ================================================================
update public.dependent_claims set expires_at = now() - interval '1 minute'
where dependent_id = 'a0000000-0000-4000-8000-000000000055';
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000057');
select is(public.graduate_dependent((select v from t_ids where k = 'code')) ->> 'error', 'invalid_code',
  'graduate_dependent: an expired code is refused');
select tests.clear_auth();
select ok((select user_id is null from public.members where id = 'a0000000-0000-4000-8000-000000000055'),
  'the expired code attached no login');
update public.dependent_claims set expires_at = now() + interval '1 day'
where dependent_id = 'a0000000-0000-4000-8000-000000000055';

-- ===== hourly limit: five misses, then even the right code is refused ========
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000056');
select is(public.graduate_dependent('ZZZZZZZ' || n::text) ->> 'ok', 'false', 'graduate_dependent: miss ' || n)
from generate_series(2, 6) n;
select throws_ok($$ select public.graduate_dependent((select v from t_ids where k = 'code')) $$, 'PT429', null,
  'graduate_dependent: after 5 misses in an hour the right code is refused with PT429');
select tests.clear_auth();
select ok((select user_id is null from public.members where id = 'a0000000-0000-4000-8000-000000000055'),
  'the rate-limited call attached no login');

-- ===== daily limit: 20 misses in 24 hours, none in the last hour ============
insert into public.claim_attempts (user_id, attempted_at)
select 'b0000000-0000-4000-8000-000000000060', now() - interval '2 hours' - n * interval '1 minute'
from generate_series(1, 20) n;
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000060');
select throws_ok($$ select public.graduate_dependent((select v from t_ids where k = 'code')) $$, 'PT429', null,
  'graduate_dependent: after 20 misses in a day the right code is refused with PT429');

-- ===== a login under the limit still redeems =================================
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000057');
select is(public.graduate_dependent((select v from t_ids where k = 'code')) ->> 'ok', 'true',
  'graduate_dependent: the right code returns ok true');

-- ===== age check at redeem time ==============================================
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000061');
select throws_ok($$ select public.graduate_dependent('YOUNG234') $$, '23514', null,
  'graduate_dependent: a dependent under 14 cannot be claimed');
select tests.clear_auth();
select ok((select user_id is null from public.members where id = tests.member_id('dependent_9')),
  'the under-14 dependent still has no login');

-- ===== adult claim ===========================================================
select pg_temp.auth_uid('b0000000-0000-4000-8000-000000000059');
select is(public.graduate_dependent('ADULT234') ->> 'ok', 'true',
  'graduate_dependent: an 18-year-old dependent claims the account');
select tests.clear_auth();
select ok((select ended_at is not null and ended_reason = 'claimed' from public.member_guardians
           where member_id = 'a0000000-0000-4000-8000-000000000058' and guardian_member_id = tests.member_id('guardian')),
  'adult claim: the guardian link ends as claimed');
select ok((select adult_consent_required from public.members where id = 'a0000000-0000-4000-8000-000000000058'),
  'adult claim: adult_consent_required is set');

-- ===== sign-in check =========================================================
-- A JWT with no subject (role authenticated, auth.uid() null) is refused by the function's own check.
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$ select public.graduate_dependent('ABCD2345') $$, '42501', 'graduate_dependent: sign in first',
  'graduate_dependent: a session with no user is refused by the sign-in check');
select tests.clear_auth();

select * from finish();
rollback;

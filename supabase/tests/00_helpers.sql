-- pgTAP helpers shared by every test file. Runs first (file order) and is committed, so the
-- `tests` schema persists in the local test database. Idempotent.
--   tests.member_id(key)      the fixture member id (see supabase/seeds/p0-02.sql)
--   tests.user_id(key)        its auth user id (raises for dependents without a login)
--   tests.branch_id('A'|'B')  placeholder branch ids
--   tests.authenticate_as(key) role authenticated + request.jwt.claims for that user
--   tests.as_anon()           role anon, anon claims
--   tests.clear_auth()        back to postgres, no claims
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.fixture_nn(member_key text)
returns int
language plpgsql immutable
set search_path = ''
as $$
declare
  nn int;
begin
  select v.nn into nn from (values
    ('super_admin', 1), ('mentor', 2), ('national_president', 3), ('national_treasurer', 4),
    ('bp_a', 5), ('bp_b', 6), ('enforcement', 7), ('support_staff', 8),
    ('member_a', 9), ('member_b', 10), ('pending', 11), ('minor_16', 12), ('guardian', 13),
    ('suspended', 14), ('pending_36', 15), ('turns_35', 16), ('turns_18', 17),
    ('dependent_9', 21), ('dependent_adult', 22)
  ) as v (key, nn) where v.key = member_key;
  if nn is null then
    raise exception 'unknown test fixture %', member_key;
  end if;
  return nn;
end;
$$;

create or replace function tests.member_id(member_key text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select ('a0000000-0000-4000-8000-' || lpad(tests.fixture_nn(member_key)::text, 12, '0'))::uuid;
$$;

create or replace function tests.user_id(member_key text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  if tests.fixture_nn(member_key) > 20 then
    raise exception 'fixture % has no login', member_key;
  end if;
  return ('b0000000-0000-4000-8000-' || lpad(tests.fixture_nn(member_key)::text, 12, '0'))::uuid;
end;
$$;

create or replace function tests.branch_id(code text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select ('c0000000-0000-4000-8000-00000000000' || lower(code))::uuid;
$$;

create or replace function tests.authenticate_as(member_key text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := tests.user_id(member_key);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid,
    'role', 'authenticated',
    'aud', 'authenticated',
    'session_id', md5('session:' || member_key)::uuid
  )::text, true);
end;
$$;

create or replace function tests.as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
end;
$$;

create or replace function tests.clear_auth()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select ok(to_regprocedure('tests.authenticate_as(text)') is not null, 'test helpers installed');
select * from finish();
commit;

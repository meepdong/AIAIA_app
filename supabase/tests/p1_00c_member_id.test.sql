-- P1-00c verify_member_id. People: seeds/p0-02.sql. bp_b holds members.verify_id for branch B
-- only; support_staff holds it nationally; enforcement and member_a do not hold it.
begin;
select plan(23);

update public.members set pass_version = 2 where id = tests.member_id('member_a');

create table tests.p1c_verify (k text primary key, r jsonb);
grant select, insert on tests.p1c_verify to authenticated;
create function pg_temp.v(label text) returns jsonb language sql as $$ select r from tests.p1c_verify where k = label $$;

select tests.as_anon();
select throws_ok($$ select public.verify_member_id(tests.member_id('member_a'), 2) $$, '42501', null, 'anon cannot verify');
select tests.authenticate_as('pending');
select throws_ok($$ select public.verify_member_id(tests.member_id('member_a'), 2) $$, '42501', null, 'a pending applicant cannot verify');
select tests.authenticate_as('member_b');
select throws_ok($$ select public.verify_member_id(tests.member_id('member_a'), 2) $$, '42501', null, 'a plain member cannot verify');
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.verify_member_id(tests.member_id('member_a'), 2) $$, '42501', null, 'a role without members.verify_id cannot verify');
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.verify_member_id(tests.member_id('member_a'), 2) $$, '42501', null, 'a super admin without a step-up cannot verify');

select tests.authenticate_as('bp_b');
insert into tests.p1c_verify values
  ('a', public.verify_member_id(tests.member_id('member_a'), 2)),
  ('a_stale', public.verify_member_id(tests.member_id('member_a'), 1)),
  ('minor', public.verify_member_id(tests.member_id('minor_16'), 1)),
  ('suspended', public.verify_member_id(tests.member_id('suspended'), 1)),
  ('pending', public.verify_member_id(tests.member_id('pending'), 1)),
  ('unknown', public.verify_member_id('a0000000-0000-4000-8000-0000000009ff', 1));
select tests.authenticate_as('support_staff');
insert into tests.p1c_verify values ('support', public.verify_member_id(tests.member_id('member_a'), 2));
select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
insert into tests.p1c_verify values ('super', public.verify_member_id(tests.member_id('member_a'), 2));
select tests.clear_auth();

select ok((pg_temp.v('a') ->> 'valid')::boolean, 'a branch B officer can verify a branch A member');
select is(pg_temp.v('a') - 'member_since',
  (select jsonb_build_object('valid', true, 'current_pass', true, 'full_name', m.full_name, 'photo_path', m.photo_path,
     'member_no', m.member_no, 'home_branch', b.name, 'wing', m.wing, 'status', 'active', 'is_minor', false)
   from public.members m join public.branches b on b.id = m.branch_id where m.id = tests.member_id('member_a')),
  'the result describes the member');
select is((pg_temp.v('a') ->> 'member_since')::timestamptz,
  (select coalesce(approved_at, created_at) from public.members where id = tests.member_id('member_a')), 'member_since is the approval time');
select is((select array_agg(j.key order by j.key) from tests.p1c_verify t, jsonb_object_keys(t.r) j (key) where t.k = 'minor'),
  array['current_pass', 'full_name', 'home_branch', 'is_minor', 'member_no', 'member_since', 'photo_path', 'status', 'valid', 'wing'],
  'the result never has a phone, DOB or email field');
select ok(not exists (
    select 1 from tests.p1c_verify t join public.member_private mp
      on mp.member_id in (tests.member_id('member_a'), tests.member_id('minor_16'))
    where position(mp.dob::text in t.r::text) > 0
      or (mp.phone is not null and position(substr(mp.phone, 2) in t.r::text) > 0)
      or (mp.email is not null and position(mp.email::text in t.r::text) > 0)),
  'no result contains a phone, DOB or email value');
select is(pg_temp.v('a_stale') -> 'valid', 'false'::jsonb, 'a stale pass is not valid');
select is(pg_temp.v('a_stale') -> 'current_pass', 'false'::jsonb, 'a stale pass is flagged as not current');
select is(pg_temp.v('minor') -> 'is_minor', 'true'::jsonb, 'a minor is flagged as a minor');
select is(pg_temp.v('suspended') -> 'valid', 'false'::jsonb, 'a suspended member is not valid');
select is(pg_temp.v('suspended') ->> 'status', 'suspended', 'a suspended member shows their status');
select is(pg_temp.v('unknown') -> 'valid', 'false'::jsonb, 'an unknown id is not valid');
select is(pg_temp.v('unknown'), '{"valid": false}'::jsonb || jsonb_build_object('status', null), 'an unknown id reveals nothing');
select is(pg_temp.v('pending'), '{"valid": false, "status": "pending"}'::jsonb,
  'an applicant gets only valid=false and the status: no name, photo or member number');
select ok(not (pg_temp.v('pending') ? 'full_name' or pg_temp.v('pending') ? 'photo_path' or pg_temp.v('pending') ? 'member_no'),
  'the pending result has no full_name, photo_path or member_no keys');
select ok(position((select full_name from public.members where id = tests.member_id('pending')) in pg_temp.v('pending')::text) = 0,
  'the pending result does not contain the applicant''s name');
select ok((pg_temp.v('support') ->> 'valid')::boolean, 'national support staff can verify');
select ok((pg_temp.v('super') ->> 'valid')::boolean, 'a super admin with a step-up can verify');
select is((select count(*)::int from public.audit_log where action = 'member.verify_id'), 8, 'every verification is audited');

select * from finish();
rollback;

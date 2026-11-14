-- P1-07b: my_passes() (who gets a signed delegate pass) and reissue_pass() (revocation).
-- Fixtures: supabase/seeds/p0-02.sql (guardian 13 of 21, 17 and 22; member_a in branch A,
-- member_b in branch B) and p1-00a.sql (tests.grant_step_up).
begin;
select plan(43);

create temp table t_pv as select id, pass_version from public.members;
grant select on t_pv to authenticated;

-- ===== execute privileges ===================================================
select ok(not has_function_privilege('anon', 'public.my_passes()', 'execute'), 'anon cannot execute my_passes');
select ok(not has_function_privilege('anon', 'public.reissue_pass(uuid)', 'execute'), 'anon cannot execute reissue_pass');
select ok(has_function_privilege('authenticated', 'public.my_passes()', 'execute'), 'authenticated may execute my_passes');

-- ===== my_passes ============================================================
select tests.authenticate_as('member_a');
select results_eq($$ select member_id, is_self from public.my_passes() $$,
  $$ values (tests.member_id('member_a'), true) $$, 'a member gets exactly their own pass');
select is((select pass_version from public.my_passes()), (select pass_version from t_pv where id = tests.member_id('member_a')),
  'the pass carries the current pass_version');
select is((select branch_name from public.my_passes()), (select b.name from public.branches b where b.id = tests.branch_id('A')),
  'the pass carries the branch name');

select tests.authenticate_as('pending');
select is((select count(*) from public.my_passes()), 0::bigint, 'pending: no pass (waiting room)');
select tests.authenticate_as('suspended');
select is((select count(*) from public.my_passes()), 0::bigint, 'suspended: no pass');

select tests.authenticate_as('guardian');
select ok(exists (select 1 from public.my_passes() where member_id = tests.member_id('guardian') and is_self),
  'a guardian gets their own pass');
select ok(exists (select 1 from public.my_passes() where member_id = tests.member_id('dependent_9') and not is_self),
  'a guardian with an active link gets the ward''s pass');
select ok(not exists (select 1 from public.my_passes() where member_id = tests.member_id('member_a')),
  'a guardian gets no pass for a non-ward');

-- Ward not active: no pass for it.
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('dependent_9');
select tests.authenticate_as('guardian');
select ok(not exists (select 1 from public.my_passes() where member_id = tests.member_id('dependent_9')),
  'no pass for a ward that is not active');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('dependent_9');

-- Ended link: the ward's pass is gone.
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select ok(not exists (select 1 from public.my_passes() where member_id = tests.member_id('dependent_9')),
  'a guardian with an ended link gets no pass for the former ward');
select ok(exists (select 1 from public.my_passes() where member_id = tests.member_id('guardian')),
  'the guardian still gets their own pass');

-- Inactive guardian: no ward passes either.
select tests.clear_auth();
update public.member_guardians set ended_at = null, ended_reason = null
where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
update public.members set status = 'suspended' where id = tests.member_id('guardian');
select tests.authenticate_as('guardian');
select is((select count(*) from public.my_passes()), 0::bigint, 'a suspended guardian gets no passes, not even for wards');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('guardian');

-- ===== reissue_pass: refused ================================================
-- reissue_pass is security definer, so RLS visibility is not the guard: the target is shown to exist
-- (as owner), the call is refused, and the version is checked unchanged as owner.
create function pg_temp.refused(who text, target text) returns setof text language plpgsql as $$
begin
  perform tests.clear_auth();
  return next ok(exists (select 1 from public.members where id = tests.member_id(target)),
    target || ' exists (refusal is not a missing row, ' || who || ')');
  perform tests.authenticate_as(who);
  return next throws_ok(format('select public.reissue_pass(%L)', tests.member_id(target)), '42501', null,
    who || ' cannot reissue ' || target || '''s pass');
  perform tests.clear_auth();
  return next is((select pass_version from public.members where id = tests.member_id(target)),
    (select pass_version from t_pv where id = tests.member_id(target)),
    target || '''s pass_version unchanged after ' || who);
end $$;

select * from pg_temp.refused('member_b', 'member_a');
select * from pg_temp.refused('member_a', 'member_a');
select * from pg_temp.refused('bp_b', 'member_a');
select * from pg_temp.refused('enforcement', 'member_a');
select * from pg_temp.refused('guardian', 'dependent_9');
select * from pg_temp.refused('super_admin', 'member_a');

select tests.authenticate_as('pending');
select throws_ok($$ select public.reissue_pass(tests.member_id('member_a')) $$, '42501', null, 'pending cannot reissue');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.reissue_pass('a0000000-0000-4000-8000-0000000000ff') $$, '42501', null,
  'an unknown id gets the same refusal');
select throws_ok($$ select public.reissue_pass(null) $$, '22023', null, 'a null id is rejected');

-- ===== reissue_pass: allowed ================================================
select tests.authenticate_as('bp_a');
select is(public.reissue_pass(tests.member_id('member_a')),
  (select pass_version + 1 from t_pv where id = tests.member_id('member_a')), 'branch A officer reissues a branch A pass');
select tests.clear_auth();
select ok(exists (select 1 from public.audit_log where action = 'member.pass_reissued'
  and entity_id = tests.member_id('member_a')::text), 'the reissue is audited');

select tests.authenticate_as('bp_b');
select is(public.reissue_pass(tests.member_id('member_b')),
  (select pass_version + 1 from t_pv where id = tests.member_id('member_b')), 'branch B officer reissues a branch B pass');
select tests.authenticate_as('national_president');
select is(public.reissue_pass(tests.member_id('member_a')),
  (select pass_version + 2 from t_pv where id = tests.member_id('member_a')), 'a national officer reissues any branch');
select tests.authenticate_as('mentor');
select is(public.reissue_pass(tests.member_id('member_b')),
  (select pass_version + 2 from t_pv where id = tests.member_id('member_b')), 'the mentor reissues');
select tests.clear_auth();
select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select is(public.reissue_pass(tests.member_id('member_a')),
  (select pass_version + 3 from t_pv where id = tests.member_id('member_a')), 'a super admin with a step-up reissues');

select tests.authenticate_as('member_a');
select is((select pass_version from public.my_passes() where is_self),
  (select pass_version + 3 from t_pv where id = tests.member_id('member_a')), 'my_passes now carries the new version');

select * from finish();
rollback;

-- P1-07b: a guardian link ended by removal reissues the ward's pass; the 18th-birthday handover
-- does not. And my_passes gives no ward pass for an adult ward with their own login, even while the
-- link is still open. Fixtures: supabase/seeds/p0-02.sql (guardian 13 of 21, 17 and 22).
begin;
select plan(9);

create temp table t_pv as select id, pass_version from public.members;

select ok(not has_function_privilege('authenticated', 'public.reissue_ward_pass_on_guardian_removal()', 'execute'),
  'clients cannot execute the reissue trigger function');

-- ===== removal reissues =====================================================
update public.member_guardians set ended_at = now(), ended_reason = 'removed'
where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
select is((select pass_version from public.members where id = tests.member_id('dependent_9')),
  (select pass_version + 1 from t_pv where id = tests.member_id('dependent_9')),
  'removal bumps the ward''s pass_version, so the old QR scans stale');
select ok(exists (select 1 from public.audit_log a where a.action = 'member.pass_reissued'
  and a.entity_id = tests.member_id('dependent_9')::text), 'the reissue is audited');

-- Updating an already ended link again does not bump twice.
update public.member_guardians set ended_at = now()
where member_id = tests.member_id('dependent_9') and guardian_member_id = tests.member_id('guardian');
select is((select pass_version from public.members where id = tests.member_id('dependent_9')),
  (select pass_version + 1 from t_pv where id = tests.member_id('dependent_9')),
  'an already ended link does not reissue again');

-- ===== the handover does not ================================================
update public.member_guardians set ended_at = now(), ended_reason = 'turned_18'
where member_id = tests.member_id('dependent_adult') and guardian_member_id = tests.member_id('guardian');
select is((select pass_version from public.members where id = tests.member_id('dependent_adult')),
  (select pass_version from t_pv where id = tests.member_id('dependent_adult')),
  'the 18th-birthday handover (turned_18) keeps the pass');

update public.member_guardians set ended_at = now(), ended_reason = 'claimed'
where member_id = tests.member_id('turns_18') and guardian_member_id = tests.member_id('guardian');
select is((select pass_version from public.members where id = tests.member_id('turns_18')),
  (select pass_version from t_pv where id = tests.member_id('turns_18')),
  'an adult ward taking over their account (claimed) keeps the pass');

-- ===== my_passes: adult ward with own login, link still open ================
update public.member_guardians set ended_at = null, ended_reason = null
where member_id = tests.member_id('turns_18') and guardian_member_id = tests.member_id('guardian');
update public.member_private set dob = ((now() at time zone 'Asia/Kolkata')::date - interval '19 years')::date
where member_id = tests.member_id('turns_18');
select ok(exists (select 1 from public.member_guardians where member_id = tests.member_id('turns_18')
  and guardian_member_id = tests.member_id('guardian') and ended_at is null)
  and exists (select 1 from public.members where id = tests.member_id('turns_18')
  and status = 'active' and user_id is not null), 'setup: an active adult ward with a login and an open link');
select tests.authenticate_as('guardian');
select ok(exists (select 1 from public.my_passes() where is_self), 'the guardian still gets their own pass');
select ok(not exists (select 1 from public.my_passes() where member_id = tests.member_id('turns_18')),
  'no ward pass for a ward past 18 with their own login, though the link is open');
select tests.clear_auth();

select * from finish();
rollback;

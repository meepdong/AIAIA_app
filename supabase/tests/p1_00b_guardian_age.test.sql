-- P1-00b age guard on is_guardian_of: guardian access ends at the ward's 18th birthday even before
-- the nightly job ends the link; adult dependents without a login keep a grace period
-- (app_settings.adult_handover_grace_days). Fixtures: supabase/seeds/p0-02.sql (guardian 13 holds
-- active links to dependent_9, turns_18 and dependent_adult).
begin;
select plan(16);

-- Every link starts active, so only the age guard can explain a denial below.
select is((select count(*)::int from public.member_guardians
           where guardian_member_id = tests.member_id('guardian') and ended_at is null), 3,
  'precondition: the guardian holds three active links');

create temp table guard_snapshot as
  select member_id, emergency_contact_name from public.member_private;
grant select on guard_snapshot to authenticated;
insert into public.notifications (member_id, kind, title) values (tests.member_id('turns_18'), 'test', 'For the 18-year-old');

-- A minor ward: read and write allowed
select tests.authenticate_as('guardian');
select isnt_empty($$ select 1 from public.member_private where member_id = tests.member_id('dependent_9') $$,
  'guardian reads the 9-year-old ward''s private row');
select ok(public.is_guardian_of(tests.member_id('dependent_9')), 'is_guardian_of is true for a minor ward');

-- Own login, 18 today, link still active: cut off
select is_empty($$ select 1 from public.member_private where member_id = tests.member_id('turns_18') $$,
  'guardian reads nothing for a ward with a login who turns 18 today, before the nightly job');
select ok(not public.is_guardian_of(tests.member_id('turns_18')), 'is_guardian_of is false from the 18th birthday');
select is_empty($$ with u as (update public.member_private set emergency_contact_name = 'Vikram Fixture'
                              where member_id = tests.member_id('turns_18') returning member_id)
                   select member_id from u $$,
  'guardian cannot update the private row of a ward who turned 18 today');
select is_empty($$ select 1 from public.notifications where member_id = tests.member_id('turns_18') $$,
  'policies built on is_guardian_of (notifications) also stop at 18');

-- Dependent without a login, 18 + 120 days, grace 90: cut off
select is_empty($$ select 1 from public.member_private where member_id = tests.member_id('dependent_adult') $$,
  'guardian reads nothing for a dependent past the grace period');
select is_empty($$ with u as (update public.member_private set emergency_contact_name = 'Vikram Fixture'
                              where member_id = tests.member_id('dependent_adult') returning member_id)
                   select member_id from u $$,
  'guardian cannot update a dependent past the grace period');

select tests.clear_auth();
select is_empty($$ select m.member_id from public.member_private m join guard_snapshot s using (member_id)
                   where m.emergency_contact_name is distinct from s.emergency_contact_name $$,
  'the blocked guardian writes changed nothing');

-- The same dependent inside the grace period (18 + 30 days): still managed
update public.member_private set dob = ((now() at time zone 'Asia/Kolkata')::date - interval '18 years 30 days')::date
where member_id = tests.member_id('dependent_adult');
select tests.authenticate_as('guardian');
select isnt_empty($$ select 1 from public.member_private where member_id = tests.member_id('dependent_adult') $$,
  'guardian reads an adult dependent without a login inside the grace period');
select isnt_empty($$ with u as (update public.member_private set emergency_contact_name = 'Vikram Fixture'
                                where member_id = tests.member_id('dependent_adult') returning member_id)
                     select member_id from u $$,
  'guardian can update an adult dependent without a login inside the grace period');

-- The grace period comes from app_settings
select tests.clear_auth();
update public.app_settings set value = '10'::jsonb where key = 'adult_handover_grace_days';
select tests.authenticate_as('guardian');
select is_empty($$ select 1 from public.member_private where member_id = tests.member_id('dependent_adult') $$,
  'a shorter adult_handover_grace_days setting ends access sooner');

-- Missing setting fails closed (no grace)
select tests.clear_auth();
update public.app_settings set value = '90'::jsonb where key = 'adult_handover_grace_days';
delete from public.app_settings where key = 'adult_handover_grace_days';
select tests.authenticate_as('guardian');
select is_empty($$ select 1 from public.member_private where member_id = tests.member_id('dependent_adult') $$,
  'without the grace setting an adult dependent is no longer managed (fail closed)');

-- A ward with a login gets no grace: 18 + 10 days with a login is cut off even with grace 90
select tests.clear_auth();
insert into public.app_settings (key, value) values ('adult_handover_grace_days', '90'::jsonb);
update public.member_private set dob = ((now() at time zone 'Asia/Kolkata')::date - interval '18 years 10 days')::date
where member_id = tests.member_id('turns_18');
select tests.authenticate_as('guardian');
select is_empty($$ select 1 from public.member_private where member_id = tests.member_id('turns_18') $$,
  'a ward with their own login gets no grace period after 18');
select isnt_empty($$ select 1 from public.member_private where member_id = tests.member_id('dependent_adult') $$,
  'the restored grace setting lets the guardian manage the adult dependent again');

select tests.clear_auth();
select * from finish();
rollback;

-- P1-00b chunk 3: daily_age_transitions (and its pg_cron job) and give_adult_consent.
-- Fixtures: supabase/seeds/p0-02.sql (turns_35, turns_18 with a login and ward of guardian 13,
-- dependent_adult past the 90-day grace, dependent_9). Created below as postgres: 53, a dependent
-- without a login who turned 18 ten days ago (inside the grace period), ward of guardian 13.
begin;
select plan(31);

insert into public.members (id, user_id, full_name, branch_id, wing, status) values
  ('a0000000-0000-4000-8000-000000000053', null, 'Zoya Placeholder', tests.branch_id('A'), 'youth', 'active');
insert into public.member_private (member_id, phone, dob) values
  ('a0000000-0000-4000-8000-000000000053', null, ((now() at time zone 'Asia/Kolkata')::date - interval '18 years 10 days')::date);
insert into public.member_guardians (member_id, guardian_member_id, relationship)
values ('a0000000-0000-4000-8000-000000000053', tests.member_id('guardian'), 'parent');

-- 63: a deleted 18+ member with a login and an active link from member_a (not guardian 13).
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000063',
        'authenticated', 'authenticated', '919000000063', now(), '{}', '{}', now(), now());
insert into public.members (id, user_id, full_name, branch_id, wing, status) values
  ('a0000000-0000-4000-8000-000000000063', 'b0000000-0000-4000-8000-000000000063', 'Karan Fixture', tests.branch_id('A'), 'youth', 'deleted');
insert into public.member_private (member_id, phone, dob) values
  ('a0000000-0000-4000-8000-000000000063', '+919000000063', ((now() at time zone 'Asia/Kolkata')::date - interval '19 years')::date);
insert into public.member_guardians (member_id, guardian_member_id, relationship)
values ('a0000000-0000-4000-8000-000000000063', tests.member_id('member_a'), 'parent');

-- Preconditions: nothing has run yet.
select ok((select wing = 'youth' from public.members where id = tests.member_id('turns_35')), 'precondition: turns_35 is youth');
select is((select count(*)::int from public.member_guardians where guardian_member_id = tests.member_id('guardian') and ended_at is null), 4,
  'precondition: the guardian holds four active links');
select ok((select not adult_consent_required from public.members where id = tests.member_id('turns_18')),
  'precondition: turns_18 has no consent flag');

-- ===== access and schedule =================================================
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.daily_age_transitions() $$, '42501', null, 'daily_age_transitions: clients cannot run it');
select tests.clear_auth();
select is((select schedule from cron.job where jobname = 'p1_00b_daily_age_transitions'), '30 19 * * *',
  'pg_cron runs the job at 19:30 UTC (01:00 IST)');
select is((select command from cron.job where jobname = 'p1_00b_daily_age_transitions'), 'select public.daily_age_transitions()',
  'the job calls daily_age_transitions');

-- ===== first run ===========================================================
create temp table t_run (n int primary key, result jsonb);
insert into t_run select 1, public.daily_age_transitions();

select ok((select wing = 'aiaia' from public.members where id = tests.member_id('turns_35')), 'turned 35: moved to wing aiaia');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('turns_35') and reason = 'wing_change' $$,
  'turned 35: a wing_change status event');

select ok((select ended_at is not null and ended_reason = 'turned_18' from public.member_guardians
           where member_id = tests.member_id('turns_18') and guardian_member_id = tests.member_id('guardian')),
  'turned 18 with a login: the guardian link has ended (turned_18)');
select ok((select adult_consent_required from public.members where id = tests.member_id('turns_18')),
  'turned 18 with a login: adult_consent_required is set');
select is((select body from public.notifications where member_id = tests.member_id('turns_18') and kind = 'membership.turned_18'),
  'You''re 18. Your account is now yours. Please review and give your consent.',
  'turned 18 with a login: the member is notified');
select isnt_empty($$ select 1 from public.notifications where member_id = tests.member_id('guardian') and kind = 'membership.ward_turned_18'
                     and data ->> 'member_id' = tests.member_id('turns_18')::text $$,
  'turned 18 with a login: the former guardian is notified');
select isnt_empty($$ select 1 from public.member_status_events where member_id = tests.member_id('turns_18') and reason = 'turned_18' $$,
  'turned 18 with a login: a status event');

select ok((select ended_at is not null and ended_reason = 'turned_18' from public.member_guardians
           where member_id = tests.member_id('dependent_adult')),
  'past the grace period: the dependent''s link has ended (turned_18)');

select ok((select ended_at is null from public.member_guardians where member_id = 'a0000000-0000-4000-8000-000000000053'),
  'turned 18 without a login, inside the grace period: the link stays');
select results_eq($$ select member_id from public.notifications where kind = 'membership.dependent_turned_18'
                     and data ->> 'member_id' = 'a0000000-0000-4000-8000-000000000053' order by member_id $$,
  $$ select x from (values (tests.member_id('bp_a')), (tests.member_id('guardian'))) v (x) order by x $$,
  'turned 18 without a login: the guardian and the branch officer are told to set up a login');
select ok((select ended_at is null from public.member_guardians where member_id = tests.member_id('dependent_9')),
  'a minor ward keeps the link');
select ok((select ended_at is null from public.member_guardians where member_id = 'a0000000-0000-4000-8000-000000000063'),
  'a deleted 18+ member with a login keeps the link; the job skips them');
select ok((select not adult_consent_required from public.members where id = 'a0000000-0000-4000-8000-000000000063'),
  'a deleted 18+ member is not flagged for adult consent');
select is((select result from t_run where n = 1),
  '{"wing_changes": 1, "grace_expired": 1, "turned_18_with_login": 1, "turned_18_without_login": 1}'::jsonb,
  'the first run reports one change of each kind');

select tests.authenticate_as('guardian');
select is_empty($$ select 1 from public.member_private where member_id = tests.member_id('turns_18') $$,
  'the former guardian reads zero member_private rows for the 18-year-old');
select tests.clear_auth();

-- ===== second run: idempotent ==============================================
create temp table t_before as
  select (select count(*) from public.member_status_events) as events,
         (select count(*) from public.notifications) as notes,
         (select count(*) from public.member_guardians where ended_at is not null) as ended,
         (select count(*) from public.audit_log) as audits;
insert into t_run select 2, public.daily_age_transitions();
select is((select result from t_run where n = 2),
  '{"wing_changes": 0, "grace_expired": 0, "turned_18_with_login": 0, "turned_18_without_login": 0}'::jsonb,
  'the second run reports no changes');
select is((select count(*) from public.member_status_events), (select events from t_before), 'the second run adds no status events');
select is((select count(*) from public.notifications), (select notes from t_before), 'the second run adds no notifications');
select is((select count(*) from public.member_guardians where ended_at is not null), (select ended from t_before),
  'the second run ends no more links');
select is((select count(*) from public.audit_log), (select audits from t_before), 'the second run writes no audit rows');

-- ===== give_adult_consent ==================================================
select tests.authenticate_as('member_a');
select throws_ok($$ select public.give_adult_consent('{"whatsapp_opt_in":true,"email_updates_opt_in":false}') $$, '23514', null,
  'give_adult_consent: refused when no consent is due');
select tests.authenticate_as('turns_18');
select throws_ok($$ select public.give_adult_consent('{"whatsapp_opt_in":"yes"}') $$, '22023', null,
  'give_adult_consent: opt-ins must be booleans');
select lives_ok($$ select public.give_adult_consent('{"whatsapp_opt_in":true,"email_updates_opt_in":false,"privacy":{"show_city":false}}') $$,
  'give_adult_consent: the 18-year-old gives consent');
select tests.clear_auth();
select ok((select not adult_consent_required and adult_consent_at is not null
                  and privacy ->> 'show_phone' = 'false' and privacy ->> 'show_email' = 'false' and privacy ->> 'show_city' = 'false'
           from public.members where id = tests.member_id('turns_18')),
  'give_adult_consent clears the flag, sets adult_consent_at and records the privacy choices');
select isnt_empty($$ select 1 from public.consent_records where member_id = tests.member_id('turns_18') and method = 'self_adult'
                     and attested_by = tests.member_id('turns_18') $$,
  'give_adult_consent writes a self_adult consent record');

select * from finish();
rollback;

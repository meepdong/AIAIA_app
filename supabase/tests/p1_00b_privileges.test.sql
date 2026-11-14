-- P1-00b: the internal helpers and claim_attempts are not reachable by clients.
begin;
select plan(14);

select ok(not has_function_privilege('anon', 'public.notify_member_or_guardians(uuid, text, text, text, text, text, text, jsonb)', 'execute'),
  'anon cannot execute notify_member_or_guardians');
select ok(not has_function_privilege('authenticated', 'public.notify_member_or_guardians(uuid, text, text, text, text, text, text, jsonb)', 'execute'),
  'authenticated cannot execute notify_member_or_guardians');
select ok(not has_function_privilege('anon', 'public.super_admin_remains(uuid, uuid)', 'execute'),
  'anon cannot execute super_admin_remains');
select ok(not has_function_privilege('authenticated', 'public.super_admin_remains(uuid, uuid)', 'execute'),
  'authenticated cannot execute super_admin_remains');
select ok(not has_function_privilege('anon', 'public.branch_officers(uuid)', 'execute'),
  'anon cannot execute branch_officers');
select ok(not has_function_privilege('authenticated', 'public.branch_officers(uuid)', 'execute'),
  'authenticated cannot execute branch_officers');
select ok(not has_function_privilege('anon', 'public.adult_handover_grace_days()', 'execute'),
  'anon cannot execute adult_handover_grace_days');
select ok(not has_function_privilege('authenticated', 'public.adult_handover_grace_days()', 'execute'),
  'authenticated cannot execute adult_handover_grace_days');
select ok(not has_function_privilege('anon', 'public.age_years(date)', 'execute'),
  'anon cannot execute age_years');
select ok(not has_function_privilege('authenticated', 'public.age_years(date)', 'execute'),
  'authenticated cannot execute age_years');
select ok(not has_function_privilege('anon', 'public.daily_age_transitions()', 'execute'),
  'anon cannot execute daily_age_transitions');
select ok(not has_function_privilege('authenticated', 'public.daily_age_transitions()', 'execute'),
  'authenticated cannot execute daily_age_transitions');
select ok(not (has_table_privilege('anon', 'public.claim_attempts', 'select') or has_table_privilege('anon', 'public.claim_attempts', 'insert')
            or has_table_privilege('anon', 'public.claim_attempts', 'update') or has_table_privilege('anon', 'public.claim_attempts', 'delete')),
  'anon has no privilege on claim_attempts');
select ok(not (has_table_privilege('authenticated', 'public.claim_attempts', 'select') or has_table_privilege('authenticated', 'public.claim_attempts', 'insert')
            or has_table_privilege('authenticated', 'public.claim_attempts', 'update') or has_table_privilege('authenticated', 'public.claim_attempts', 'delete')),
  'authenticated has no privilege on claim_attempts');

select * from finish();
rollback;

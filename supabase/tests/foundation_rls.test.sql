-- Every public table has RLS; every security definer function pins search_path; audit and
-- helper functions are not callable by anon.
begin;
select plan(18);

select has_table('public', t, 'table public.' || t || ' exists')
from unnest(array['branches', 'members', 'member_private', 'member_guardians', 'roles', 'permissions',
  'role_permissions', 'role_assignments', 'member_status_events', 'audit_log']) t;

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row level security enabled'
);

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'every security definer function in public sets search_path = '''''
);

select ok(not has_function_privilege('authenticated', 'public.write_audit(text,text,text,jsonb)', 'execute'),
  'authenticated cannot call write_audit');
select ok(not has_function_privilege('anon', 'public.write_audit(text,text,text,jsonb)', 'execute'),
  'anon cannot call write_audit');
select ok(not has_function_privilege('anon', 'public.has_permission(text,uuid)', 'execute'),
  'anon cannot call has_permission');
select ok(not has_function_privilege('anon', 'public.is_minor(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.is_minor(uuid)', 'execute'),
  'clients cannot call is_minor');

select ok(not has_table_privilege('authenticated', 'public.member_private', 'truncate')
  and not has_table_privilege('anon', 'public.members', 'truncate'),
  'clients cannot truncate (TRUNCATE ignores RLS)');

-- is_minor boundaries (run as owner)
select ok(public.is_minor(tests.member_id('minor_16')) and public.is_minor(tests.member_id('dependent_9'))
  and not public.is_minor(tests.member_id('turns_18')) and not public.is_minor(tests.member_id('member_a')),
  'is_minor: 16 and 9 are minors; exactly 18 today and 22 are not');

select * from finish();
rollback;

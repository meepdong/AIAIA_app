-- audit_log: insert-only for everyone (owner and service_role included), written only through
-- write_audit from security definer code, readable only with audit.view.
begin;
select plan(27);

-- Owner writes one row through write_audit (as a security definer RPC would)
select ok(public.write_audit('test.seeded', 'members', tests.member_id('member_a')::text, '{"k": 1}') > 0,
  'write_audit inserts a row and returns its id');
select throws_ok($$ select public.write_audit('', 'members') $$, '22023', null, 'write_audit rejects an empty action');
select throws_ok($$ select public.write_audit('x', 'members', null, '[1]') $$, '22023', null,
  'write_audit rejects non-object details');

-- A security definer wrapper (the only legitimate path) records the calling member
create function tests.audit_probe()
returns bigint
language sql volatile security definer
set search_path = ''
as $$ select public.write_audit('test.probe', 'members', null, '{}'::jsonb); $$;
grant execute on function tests.audit_probe() to authenticated;

select tests.authenticate_as('member_a');
select ok(tests.audit_probe() > 0, 'a security definer RPC can write the audit log for a client');
select tests.clear_auth();
select is((select actor_member_id from public.audit_log where action = 'test.probe'), tests.member_id('member_a'),
  'write_audit records the calling member as actor');

-- Insert-only, even for the table owner
select throws_ok($$ update public.audit_log set action = 'tampered' $$, '42501', 'audit_log is insert-only',
  'postgres cannot update audit_log');
select throws_ok($$ delete from public.audit_log $$, '42501', 'audit_log is insert-only',
  'postgres cannot delete from audit_log');
select throws_ok($$ truncate public.audit_log $$, '42501', 'audit_log is insert-only',
  'postgres cannot truncate audit_log');

-- ... and for service_role
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok($$ update public.audit_log set action = 'tampered' $$, '42501', 'audit_log is insert-only',
  'service_role cannot update audit_log');
select throws_ok($$ delete from public.audit_log $$, '42501', 'audit_log is insert-only',
  'service_role cannot delete from audit_log');
select throws_ok($$ truncate public.audit_log $$, '42501', 'audit_log is insert-only',
  'service_role cannot truncate audit_log');
select tests.clear_auth();
select is((select count(*)::int from public.audit_log where action = 'test.seeded'), 1, 'the audit row is intact');

-- Clients cannot call write_audit or write the table directly
select tests.as_anon();
select throws_ok($$ select public.write_audit('x', 'y') $$, '42501', null, 'anon cannot call write_audit');
select throws_ok($$ insert into public.audit_log (action, entity) values ('x', 'y') $$, '42501', null,
  'anon cannot insert into audit_log');
select is_empty($$ select id from public.audit_log $$, 'anon cannot read audit_log');

select tests.authenticate_as('member_a');
select throws_ok($$ select public.write_audit('x', 'y') $$, '42501', null, 'active member cannot call write_audit');
select throws_ok($$ insert into public.audit_log (action, entity) values ('x', 'y') $$, '42501', null,
  'active member cannot insert into audit_log');

select tests.authenticate_as('national_president');
select throws_ok($$ select public.write_audit('x', 'y') $$, '42501', null, 'national president cannot call write_audit');

-- Only audit.view can read
select tests.authenticate_as('national_president');
select isnt_empty($$ select id from public.audit_log where action = 'test.seeded' $$,
  'national president (audit.view) reads the audit log');
select tests.authenticate_as('mentor');
select isnt_empty($$ select id from public.audit_log where action = 'test.seeded' $$,
  'mentor (audit.view) reads the audit log');

select tests.authenticate_as('member_a');
select is_empty($$ select id from public.audit_log $$, 'active member without audit.view reads nothing');
select tests.authenticate_as('bp_a');
select is_empty($$ select id from public.audit_log $$, 'branch president reads nothing');
select tests.authenticate_as('enforcement');
select is_empty($$ select id from public.audit_log $$, 'enforcement committee reads nothing');
select tests.authenticate_as('support_staff');
select is_empty($$ select id from public.audit_log $$, 'support staff reads nothing');
select tests.authenticate_as('super_admin');
select is_empty($$ select id from public.audit_log $$, 'super admin without step-up reads nothing');
select tests.authenticate_as('pending');
select is_empty($$ select id from public.audit_log $$, 'pending user reads nothing');

-- A suspended holder of audit.view reads nothing
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('national_president');
select tests.authenticate_as('national_president');
select is_empty($$ select id from public.audit_log $$, 'suspended national president reads nothing');

select tests.clear_auth();
select * from finish();
rollback;

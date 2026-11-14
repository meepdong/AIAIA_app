-- P1-00a step-up: has_step_up() reads admin_step_ups for the session; step_up_roles() reads app_settings.
-- Fixtures: supabase/seeds/p0-02.sql, helpers tests.grant_step_up / tests.session_id in seeds/p1-00a.sql.
begin;
select plan(29);

-- Without a step-up row
select tests.authenticate_as('super_admin');
select ok(not public.has_step_up(), 'super admin with no step-up row: has_step_up is false');
select ok(not public.has_permission('roles.assign'), 'super admin without a step-up fails roles.assign');

-- A row for a different session of the same member
select tests.clear_auth();
select tests.grant_step_up('super_admin', null, md5('another session')::uuid);
select tests.authenticate_as('super_admin');
select ok(not public.has_step_up(), 'a step-up row for a different session id does not count');
select ok(not public.has_permission('roles.assign'), 'a different session''s step-up does not grant roles.assign');

-- A row for this session id but issued to someone else
select tests.clear_auth();
insert into public.admin_step_ups (session_id, member_id, source)
values (tests.ensure_session('super_admin'), tests.member_id('mentor'), 'email_otp');
select tests.authenticate_as('super_admin');
select ok(not public.has_permission('roles.assign'), 'a step-up row for this session but another member does not count');

-- An expired row
select tests.clear_auth();
update public.admin_step_ups set member_id = tests.member_id('super_admin'), expires_at = now() - interval '1 minute'
where session_id = tests.session_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(not public.has_permission('roles.assign'), 'an expired step-up does not count');

-- A row with expires_at NULL (life of the session)
select tests.clear_auth();
update public.admin_step_ups set expires_at = null where session_id = tests.session_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(public.has_step_up(), 'step-up row with expires_at NULL: has_step_up is true');
select ok(public.has_permission('roles.assign'), 'super admin with a step-up passes roles.assign');
select ok(public.has_permission('system.config'), 'super admin with a step-up has system.config');

-- A trusted-device step-up lives and dies with its device
select tests.clear_auth();
insert into public.admin_trusted_devices (id, member_id, secret_hash)
values ('f0000000-0000-4000-8000-000000000001', tests.member_id('super_admin'), repeat('a', 64));
update public.admin_step_ups set trusted_device_id = 'f0000000-0000-4000-8000-000000000001', source = 'trusted_device'
where session_id = tests.session_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(public.has_step_up(), 'a step-up from a live trusted device counts');
select tests.clear_auth();
update public.admin_trusted_devices set revoked_at = now() where id = 'f0000000-0000-4000-8000-000000000001';
select tests.authenticate_as('super_admin');
select ok(not public.has_step_up(), 'the step-up is false once its trusted device is revoked');
select ok(not public.has_permission('roles.assign'), 'a revoked device''s step-up does not grant roles.assign');
select tests.clear_auth();
update public.admin_trusted_devices set revoked_at = null, expires_at = now() - interval '1 minute'
where id = 'f0000000-0000-4000-8000-000000000001';
select tests.authenticate_as('super_admin');
select ok(not public.has_step_up(), 'a step-up from an expired trusted device does not count');
select tests.clear_auth();
update public.admin_trusted_devices set expires_at = now() + interval '1 day' where id = 'f0000000-0000-4000-8000-000000000001';
select tests.authenticate_as('super_admin');
select ok(public.has_step_up(), 'a step-up from a trusted device that expires in the future counts');
select tests.clear_auth();
update public.admin_step_ups set trusted_device_id = null, source = 'email_otp' where session_id = tests.session_id('super_admin');

-- A step-up dies with its login session
select tests.clear_auth();
delete from auth.sessions where id = tests.session_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(not public.has_step_up(), 'the step-up is false when its auth session row is gone');
select tests.clear_auth();
select tests.ensure_session('super_admin');

-- A future expiry still counts
select tests.clear_auth();
update public.admin_step_ups set expires_at = now() + interval '1 hour' where session_id = tests.session_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(public.has_permission('roles.assign'), 'a step-up expiring in the future counts');

-- A malformed session claim yields false, not an error
select set_config('request.jwt.claims', json_build_object('sub', tests.user_id('super_admin'), 'role', 'authenticated',
  'session_id', 'not-a-uuid')::text, true);
select ok(not public.has_step_up(), 'a malformed session_id claim yields no step-up');

-- A step-up never revives a suspended super admin
select tests.clear_auth();
update public.members set status = 'suspended' where id = tests.member_id('super_admin');
select tests.authenticate_as('super_admin');
select ok(not public.has_permission('roles.assign'), 'suspended super admin with a step-up has nothing');
select tests.clear_auth();
update public.members set status = 'active' where id = tests.member_id('super_admin');

-- Clients can neither read nor write step-ups, even a stepped-up super admin
select tests.authenticate_as('super_admin');
select throws_ok($$ select * from public.admin_step_ups $$, '42501', null, 'super admin cannot read admin_step_ups');
select tests.authenticate_as('mentor');
select throws_ok($$ insert into public.admin_step_ups (session_id, member_id, source)
  values (tests.session_id('mentor'), tests.member_id('mentor'), 'email_otp') $$, '42501', null,
  'mentor cannot write their own step-up');

-- step_up_roles() is internal: clients cannot call it; it reads app_settings
select tests.authenticate_as('mentor');
select throws_ok($$ select public.step_up_roles() $$, '42501', null, 'an authenticated user cannot call step_up_roles()');
select tests.clear_auth();
select is(public.step_up_roles(), array['super_admin'], 'step_up_roles defaults to super_admin from app_settings');
select tests.authenticate_as('mentor');
select ok(public.has_permission('members.approve'), 'mentor (not a step-up role) approves without a step-up');
select tests.clear_auth();
update public.app_settings set value = '["super_admin", "mentor"]' where key = 'step_up_roles';
select tests.authenticate_as('mentor');
select ok(not public.has_permission('members.approve'), 'mentor listed in step_up_roles needs a step-up');
select tests.clear_auth();
select tests.grant_step_up('mentor');
select tests.authenticate_as('mentor');
select ok(public.has_permission('members.approve'), 'listed mentor with a step-up approves');

-- step_up_roles can never be emptied or lose super_admin (as owner, bypassing RLS)
select tests.clear_auth();
select throws_ok($$ update public.app_settings set value = '[]' where key = 'step_up_roles' $$, '23514', null,
  'step_up_roles cannot be set to an empty list');
select throws_ok($$ update public.app_settings set value = '["mentor"]' where key = 'step_up_roles' $$, '23514', null,
  'step_up_roles must keep super_admin');

-- A missing setting fails closed to super_admin
select tests.clear_auth();
delete from public.app_settings where key = 'step_up_roles';
select is(public.step_up_roles(), array['super_admin'], 'missing step_up_roles setting falls back to super_admin');
delete from public.admin_step_ups;
select tests.authenticate_as('super_admin');
select ok(not public.has_permission('roles.assign'), 'with the setting missing, super admin still needs a step-up');

select tests.clear_auth();
select * from finish();
rollback;

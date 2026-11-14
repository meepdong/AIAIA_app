-- P1-01: auth.users phone change guard (trigger guard_phone_change).
-- The trigger fires for every role (gotrue writes as supabase_auth_admin, which postgres cannot assume),
-- so the writes run as postgres on rows that exist. Fixtures: supabase/seeds/p0-02.sql (member_a has a login and a phone). Created below:
--   user ...0070 with no phone yet (first-time set must stay possible)
begin;
select plan(11);

insert into auth.users (instance_id, id, aud, role, phone, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000070',
        'authenticated', 'authenticated', null, now(), now());

create temp table before_state as
select phone, phone_change from auth.users where id = tests.user_id('member_a');


-- The row is visible to the role that attempts the writes.
select is((select count(*)::int from auth.users where id = tests.user_id('member_a')), 1,
  'the member''s auth user exists');

select throws_ok(
  $$update auth.users set phone = '919000000099' where id = tests.user_id('member_a')$$,
  '42501', null, 'changing an existing phone is refused');

select throws_ok(
  $$update auth.users set phone = null where id = tests.user_id('member_a')$$,
  '42501', null, 'clearing an existing phone is refused');

select throws_ok(
  $$update auth.users set phone_change = '919000000099', phone_change_token = 'x'
    where id = tests.user_id('member_a')$$,
  '42501', null, 'requesting a phone change (updateUser) is refused');

select is(
  (select (u.phone, u.phone_change) from auth.users u where u.id = tests.user_id('member_a')),
  (select (b.phone, b.phone_change) from before_state b),
  'checked as owner: nothing changed on the refused writes');


select lives_ok(
  $$update auth.users set last_sign_in_at = now() where id = tests.user_id('member_a')$$,
  'ordinary updates (sign-in bookkeeping) are untouched');

select lives_ok(
  $$update auth.users set phone = phone where id = tests.user_id('member_a')$$,
  'rewriting the same phone is not a change');

select lives_ok(
  $$update auth.users set phone = '919000000070' where id = 'b0000000-0000-4000-8000-000000000070'$$,
  'setting a phone on an account that has none is allowed');

select lives_ok(
  $$update auth.users set phone_change = '' where id = tests.user_id('member_a')$$,
  'clearing phone_change is allowed');

-- The sanctioned path: a transaction-local opt-in, as the future members.change_phone RPC will do.
select set_config('aiaia.allow_phone_change', 'on', true);
select lives_ok(
  $$update auth.users set phone = '919000000098' where id = tests.user_id('member_a')$$,
  'the sanctioned path (opt-in setting) can change the phone');

select is((select phone from auth.users where id = tests.user_id('member_a')), '919000000098',
  'checked as owner: the sanctioned change was applied');

select * from finish();
rollback;

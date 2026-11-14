-- P1-01: public.otp_throttle_take, the atomic OTP send throttle (finding M3).
-- Runs as postgres (the function's owner) except where a role is named. now() is fixed for the
-- whole transaction, so every row the function inserts here has sent_at = now().
-- Fixture hashes are local to this file (grep: p101throttle):
--   p101throttle_hour_...  the hour limit
--   p101throttle_day_....  the day limit, with seeded past sends
--   p101throttle_other...  a different number, unaffected
begin;
select plan(25);

create temp table h (name text primary key, hash text not null);
insert into h values
  ('hour',  'p101throttle_hour_' || repeat('0', 46)),
  ('day',   'p101throttle_day_'  || repeat('0', 47)),
  ('other', 'p101throttle_other' || repeat('0', 46));

create function pg_temp.sent(p_name text) returns integer language sql as $$
  select count(*)::int from public.otp_throttle t
   where t.phone_hash = (select hash from h where name = p_name)
$$;
create function pg_temp.take(p_name text) returns jsonb language sql as $$
  select public.otp_throttle_take((select hash from h where name = p_name))
$$;

-- Hour limit: five allowed, each recording exactly one row; the sixth refused, recording none.
select is(pg_temp.take('hour'), '{"allowed": true}'::jsonb, '1st send in the hour is allowed');
select is(pg_temp.sent('hour'), 1, '1st allowed send records one row');
select is(pg_temp.take('hour'), '{"allowed": true}'::jsonb, '2nd send in the hour is allowed');
select is(pg_temp.sent('hour'), 2, '2nd allowed send records one row');
select is(pg_temp.take('hour'), '{"allowed": true}'::jsonb, '3rd send in the hour is allowed');
select is(pg_temp.sent('hour'), 3, '3rd allowed send records one row');
select is(pg_temp.take('hour'), '{"allowed": true}'::jsonb, '4th send in the hour is allowed');
select is(pg_temp.sent('hour'), 4, '4th allowed send records one row');
select is(pg_temp.take('hour'), '{"allowed": true}'::jsonb, '5th send in the hour is allowed');
select is(pg_temp.sent('hour'), 5, '5th allowed send records one row');

create temp table sixth as select pg_temp.take('hour') as r;
select is((select r->>'allowed' from sixth), 'false', 'the 6th send within an hour is refused');
select is((select (r->>'retry_at')::timestamptz from sixth), now() + interval '1 hour',
  'the refusal says to retry when the oldest counting send is an hour old');
select is(pg_temp.sent('hour'), 5, 'a refused send records no row');

-- Another number is unaffected by the first one's limit.
select is(pg_temp.take('other'), '{"allowed": true}'::jsonb, 'a different number is still allowed');
select is(pg_temp.sent('other'), 1, 'and records its own row');

-- Day limit: nine past sends spaced two hours apart (none in the last hour), plus one 25 hours
-- ago that no longer counts. The 10th send today is allowed; the 11th is refused.
insert into public.otp_throttle (phone_hash, sent_at)
select (select hash from h where name = 'day'), now() - i * interval '2 hours'
  from generate_series(1, 9) as i;
insert into public.otp_throttle (phone_hash, sent_at)
values ((select hash from h where name = 'day'), now() - interval '25 hours');

select is(pg_temp.take('day'), '{"allowed": true}'::jsonb,
  'the 10th send within a day is allowed (a send older than a day does not count)');
select is(pg_temp.sent('day'), 11, 'the 10th send records one row');

create temp table eleventh as select pg_temp.take('day') as r;
select is((select r->>'allowed' from eleventh), 'false',
  'the 11th send within a day is refused even with no hour limit hit');
select is((select (r->>'retry_at')::timestamptz from eleventh), now() + interval '6 hours',
  'the refusal says to retry when the oldest counting send (18h ago) is a day old');
select is(pg_temp.sent('day'), 11, 'the refused 11th send records no row');

-- Input validation.
select throws_ok($$ select public.otp_throttle_take('tooshort') $$, '22023', null,
  'a hash shorter than 16 characters is refused');

-- Privileges: only the service role may call it, and the function is the only insert path.
select ok(not has_function_privilege('anon', 'public.otp_throttle_take(text)', 'execute'),
  'anon cannot execute otp_throttle_take');
select ok(not has_function_privilege('authenticated', 'public.otp_throttle_take(text)', 'execute'),
  'authenticated cannot execute otp_throttle_take');
select ok(has_function_privilege('service_role', 'public.otp_throttle_take(text)', 'execute'),
  'service_role can execute otp_throttle_take');
select ok(not has_table_privilege('service_role', 'public.otp_throttle', 'insert'),
  'service_role cannot insert into otp_throttle directly, bypassing the lock');

select * from finish();
rollback;

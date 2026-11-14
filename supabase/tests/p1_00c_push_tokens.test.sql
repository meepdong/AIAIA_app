-- P1-00c register_push_token: a definer upsert that moves an existing token (or web-push endpoint)
-- to the caller. People (seeds/p0-02.sql): member_a, member_b, pending.
begin;
select plan(19);

select tests.as_anon();
select throws_ok($$ select public.register_push_token('p1c-tok-anon', 'android') $$,
  '42501', null, 'anon cannot register a push token');

-- Native token: register, then move to another member
select tests.authenticate_as('member_a');
select lives_ok($$ select public.register_push_token('p1c-tok-1', 'android') $$, 'member A registers a token');
select tests.clear_auth();
select is((select member_id from public.push_tokens where token = 'p1c-tok-1'), tests.member_id('member_a'),
  'the token belongs to member A');
update public.push_tokens set last_seen_at = now() - interval '30 days' where token = 'p1c-tok-1';

select tests.authenticate_as('member_a');
select lives_ok($$ select public.register_push_token('p1c-tok-1', 'android') $$,
  'registering the same token again is an upsert, not an error');
select tests.clear_auth();
select is((select count(*)::int from public.push_tokens where token = 'p1c-tok-1'), 1, 're-registering keeps one row');
select ok((select last_seen_at > now() - interval '1 minute' from public.push_tokens where token = 'p1c-tok-1'),
  're-registering refreshes last_seen_at');
update public.push_tokens set last_seen_at = now() - interval '30 days' where token = 'p1c-tok-1';

select tests.authenticate_as('member_b');
select lives_ok($$ select public.register_push_token('p1c-tok-1', 'android') $$,
  'member B registers the same token (device changed hands)');
select tests.clear_auth();
select is((select member_id from public.push_tokens where token = 'p1c-tok-1'), tests.member_id('member_b'),
  'the token moved to member B');
select is_empty($$ select 1 from public.push_tokens where token = 'p1c-tok-1' and member_id = tests.member_id('member_a') $$,
  'member A no longer has a row with that token');
select ok((select last_seen_at > now() - interval '1 minute' from public.push_tokens where token = 'p1c-tok-1'),
  'the move refreshes last_seen_at');
select ok(exists (select 1 from public.audit_log a join public.push_tokens t on t.id::text = a.entity_id
  where t.token = 'p1c-tok-1' and a.action = 'push_token.move'
    and a.details ->> 'from_member_id' = tests.member_id('member_a')::text), 'the move is audited');

-- Web push: the subscription endpoint is the key
select tests.authenticate_as('member_a');
select lives_ok($$ select public.register_push_token(null, 'web',
  '{"endpoint": "https://push.example.test/p1c-1", "keys": {"p256dh": "x", "auth": "y"}}'::jsonb) $$,
  'member A registers a web-push subscription');
select tests.authenticate_as('member_b');
select lives_ok($$ select public.register_push_token(null, 'web',
  '{"endpoint": "https://push.example.test/p1c-1", "keys": {"p256dh": "x2", "auth": "y2"}}'::jsonb) $$,
  'member B registers the same endpoint');
select tests.clear_auth();
select is((select member_id::text || ' ' || (subscription -> 'keys' ->> 'auth')
   from public.push_tokens where subscription ->> 'endpoint' = 'https://push.example.test/p1c-1'),
  tests.member_id('member_b')::text || ' y2', 'the endpoint moved to member B with the new keys');

-- Pending applicants can register (they are told the outcome of their application)
select tests.authenticate_as('pending');
select lives_ok($$ select public.register_push_token('p1c-tok-pending', 'android') $$,
  'a pending applicant can register a device');

-- Input validation
select tests.authenticate_as('member_a');
select throws_ok($$ select public.register_push_token('p1c-tok-2', 'symbian') $$, '22023', null,
  'an unknown platform is rejected');
select throws_ok($$ select public.register_push_token('p1c-tok-2', 'web', '{"endpoint": "https://push.example.test/p1c-2"}'::jsonb) $$,
  '22023', null, 'web push with a token is rejected');
select throws_ok($$ select public.register_push_token(null, 'web', '{"endpoint": "http://push.example.test/p1c-3"}'::jsonb) $$,
  '22023', null, 'a web-push endpoint must be https');
select throws_ok($$ select public.register_push_token('p1c-tok-2', 'android', '{"endpoint": "https://push.example.test/p1c-4"}'::jsonb) $$,
  '22023', null, 'a native token with a subscription is rejected');

select * from finish();
rollback;

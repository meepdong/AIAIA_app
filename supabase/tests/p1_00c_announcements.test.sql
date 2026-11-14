-- P1-00c publish_announcement and removed content. Fixture content (seeds/p1-00a.sql), by id suffix:
--   02 branch A youth, 05 branch A draft, 06 branch A hidden, 09 branch A scheduled (announcements);
--   event 02 branch A youth published. People (seeds/p0-02.sql): bp_a is branch_president of A,
--   bp_b of B; member_a, minor_16 and dependent_9 are youth in A; guardian is aiaia in A; member_b
--   is youth in B; pending and suspended are in A.
begin;
select plan(28);

insert into public.app_settings (key, value, description)
values ('notify_dispatch_url', '"http://127.0.0.1:9/functions/v1/notify-dispatch"'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;
insert into public.app_settings (key, value, description)
values ('notify_dispatch_secret', '"test-secret"'::jsonb, 'test')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- publish_announcement: who may publish
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.publish_announcement('d0000000-0000-4000-8000-000000000005', true) $$,
  '42501', null, 'anon cannot publish');
select tests.authenticate_as('member_a');
select throws_ok($$ select public.publish_announcement('d0000000-0000-4000-8000-000000000005', true) $$,
  '42501', null, 'a plain member cannot publish');
select tests.authenticate_as('bp_b');
select throws_ok($$ select public.publish_announcement('d0000000-0000-4000-8000-000000000005', true) $$,
  '42501', null, 'branch B''s officer cannot publish a branch A announcement');
select throws_ok($$ select public.publish_announcement('d0000000-0000-4000-8000-0000000000ff', true) $$,
  '42501', null, 'an unknown id gets the same answer as a forbidden one');
select tests.clear_auth();
select is((select published_at from public.announcements where id = 'd0000000-0000-4000-8000-000000000005'),
  null, 'the refused calls left the draft unpublished');
select is((select count(*)::int from public.notifications where kind = 'announcement.published'), 0,
  'the refused calls created no notifications');

-- ---------------------------------------------------------------------------
-- publish_announcement with notify: active audience members only, in one statement
-- ---------------------------------------------------------------------------
create temp table q_before as select count(*) as n from net.http_request_queue;
create temp table expected_n as
  select count(*)::int as n from public.members
  where status = 'active' and branch_id = tests.branch_id('A') and wing = 'youth';
select tests.authenticate_as('bp_a');
create temp table published as
  select public.publish_announcement('d0000000-0000-4000-8000-000000000005', true) as n;
select tests.clear_auth();

select is((select n from published), (select n from expected_n),
  'returns one notification per active youth member of branch A');
select is((select count(*)::int from public.notifications
   where kind = 'announcement.published' and data ->> 'announcement_id' = 'd0000000-0000-4000-8000-000000000005'),
  (select n from expected_n), 'one notifications row per audience member');
select is((select count(*) from net.http_request_queue) - (select n from q_before), 1::bigint,
  'the notifications went in as a single statement (exactly one wake-up)');
select ok(exists (select 1 from public.notifications where kind = 'announcement.published'
  and member_id = tests.member_id('member_a')), 'an active member of the audience is notified');
select ok(exists (select 1 from public.notifications where kind = 'announcement.published'
  and member_id = tests.member_id('dependent_9')), 'a dependent without a login is notified (routed to guardians)');
select ok(not exists (select 1 from public.notifications where kind = 'announcement.published'
  and member_id in (tests.member_id('pending'), tests.member_id('suspended'))),
  'pending and suspended members of the branch are not notified');
select ok(not exists (select 1 from public.notifications where kind = 'announcement.published'
  and member_id = tests.member_id('guardian')), 'a member of the other wing is not notified');
select ok(not exists (select 1 from public.notifications where kind = 'announcement.published'
  and member_id = tests.member_id('member_b')), 'a member of another branch is not notified');
select ok((select published_at <= now() from public.announcements where id = 'd0000000-0000-4000-8000-000000000005'),
  'the announcement is published');
select ok(exists (select 1 from public.audit_log where action = 'announcement.publish'
  and entity_id = 'd0000000-0000-4000-8000-000000000005'), 'publishing is audited');

select tests.authenticate_as('bp_a');
select throws_ok($$ select public.publish_announcement('d0000000-0000-4000-8000-000000000005', true) $$,
  '22023', null, 'an already published announcement cannot be published (and notified) again');
select throws_ok($$ select public.publish_announcement('d0000000-0000-4000-8000-000000000006', false) $$,
  '22023', null, 'a hidden announcement cannot be published');
select is(public.publish_announcement('d0000000-0000-4000-8000-000000000009', false), 0,
  'a scheduled announcement can be published now without notifications');
select tests.authenticate_as('member_a');
select ok(exists (select 1 from public.announcements where id = 'd0000000-0000-4000-8000-000000000009'),
  'members see the announcement once it is published');

-- ---------------------------------------------------------------------------
-- Removed content: hidden from members, and officers cannot restore it
-- ---------------------------------------------------------------------------
select ok(exists (select 1 from public.announcements where id = 'd0000000-0000-4000-8000-000000000002'),
  'member A sees announcement 02 before removal');
select ok(exists (select 1 from public.events where id = 'e0000000-0000-4000-8000-000000000002'),
  'member A sees event 02 before removal');
select tests.clear_auth();
update public.announcements set removed_at = now(), removed_by = tests.member_id('enforcement')
  where id = 'd0000000-0000-4000-8000-000000000002';
update public.events set removed_at = now(), removed_by = tests.member_id('enforcement')
  where id = 'e0000000-0000-4000-8000-000000000002';

select tests.authenticate_as('member_a');
select ok(not exists (select 1 from public.announcements where id = 'd0000000-0000-4000-8000-000000000002'),
  'members no longer see a removed announcement');
select ok(not exists (select 1 from public.events where id = 'e0000000-0000-4000-8000-000000000002'),
  'members no longer see a removed event');

select tests.authenticate_as('bp_a');
select ok(exists (select 1 from public.announcements where id = 'd0000000-0000-4000-8000-000000000002')
  and exists (select 1 from public.events where id = 'e0000000-0000-4000-8000-000000000002'),
  'branch A''s officer still sees the removed rows');
select throws_ok($$ update public.announcements set removed_at = null, removed_by = null
  where id = 'd0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'an officer cannot clear removed_at on an announcement');
select throws_ok($$ update public.events set removed_at = null, removed_by = null
  where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'an officer cannot clear removed_at on an event');
select tests.clear_auth();
select ok((select removed_at is not null and removed_by is not null from public.announcements
   where id = 'd0000000-0000-4000-8000-000000000002')
  and (select removed_at is not null and removed_by is not null from public.events
   where id = 'e0000000-0000-4000-8000-000000000002'),
  'the removed rows are still removed');

select * from finish();
rollback;

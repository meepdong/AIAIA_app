-- P1-00c submit_report and review_report. People (seeds/p0-02.sql): super_admin (needs a step-up),
-- mentor (reports.review and content.remove, no members.block), enforcement (reports.review,
-- members.block, content.remove), bp_a (branch officer, no reports.review), member_a, member_b,
-- pending, suspended. Content (seeds/p1-00a.sql): announcement 03 (branch B, by national_president),
-- announcement 08 and event 08 (national, all).
begin;
select plan(49);

-- Ids of reports created through the RPC, keyed by a label
create table tests.p1c_reports (k text primary key, id uuid not null);
grant select, insert on tests.p1c_reports to authenticated;
create function pg_temp.rid(label text) returns uuid language sql as
  $$ select id from tests.p1c_reports where k = label $$;

-- block runs P1-00b's real block_member: the target is suspended with a status event.

-- ---------------------------------------------------------------------------
-- submit_report
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.submit_report('member', tests.member_id('member_b'), 'spam', null) $$,
  '42501', null, 'anon cannot report');
select tests.authenticate_as('pending');
select throws_ok($$ select public.submit_report('member', tests.member_id('member_b'), 'spam', null) $$,
  '42501', null, 'a pending applicant cannot report');
select tests.authenticate_as('suspended');
select throws_ok($$ select public.submit_report('member', tests.member_id('member_b'), 'spam', null) $$,
  '42501', null, 'a suspended member cannot report');

select tests.authenticate_as('member_a');
insert into tests.p1c_reports
  select 'harass', public.submit_report('member', tests.member_id('member_b'), 'harassment', 'Rude messages');
select is((select status from public.my_reports() where id = pg_temp.rid('harass')), 'open',
  'an active member can report, and sees the report as open');
select throws_ok($$ select public.submit_report('member', tests.member_id('member_b'), 'block_request', null) $$,
  '22023', null, 'reason block_request is reserved for request_block');
select throws_ok($$ select public.submit_report('member', tests.member_id('member_b'), ' Block_Request ', null) $$,
  '22023', null, 'block_request is rejected whatever its case and spacing');
select throws_ok($$ select public.submit_report('member', tests.member_id('member_b'), 'spam', repeat('x', 2001)) $$,
  '22023', null, 'details longer than 2000 characters are rejected');
select throws_ok($$ select public.submit_report('Member!', tests.member_id('member_b'), 'spam', null) $$,
  '22023', null, 'a malformed target_type is rejected');
select tests.clear_auth();
select is_empty($$ select 1 from public.notifications where data ->> 'report_id' = pg_temp.rid('harass')::text $$,
  'an ordinary report sends no alerts');
select ok(exists (select 1 from public.audit_log where action = 'report.submit' and entity_id = pg_temp.rid('harass')::text),
  'submitting is audited');

-- safety_minor: high-priority alerts to every active holder of members.block
select tests.authenticate_as('member_a');
insert into tests.p1c_reports
  select 'safety', public.submit_report('member', tests.member_id('member_b'), 'safety_minor', 'Asked a minor to meet alone');
select tests.clear_auth();
select is(
  (select array_agg(member_id order by member_id) from public.notifications
   where data ->> 'report_id' = pg_temp.rid('safety')::text),
  array[tests.member_id('super_admin'), tests.member_id('enforcement')],
  'safety_minor alerts the enforcement committee and the super admin, and nobody else (not the mentor)');
select is(
  (select array_agg(distinct priority) from public.notifications where data ->> 'report_id' = pg_temp.rid('safety')::text),
  array['high'], 'the safety alerts are high priority');
select is(
  (select array_agg(distinct data) from public.notifications where data ->> 'report_id' = pg_temp.rid('safety')::text),
  array[jsonb_build_object('report_id', pg_temp.rid('safety'))],
  'the alert carries only the report id');
select ok(not exists (select 1 from public.notifications where data ->> 'report_id' = pg_temp.rid('safety')::text
  and (body ilike '%meet alone%' or title ilike '%meet alone%')), 'the alert text does not repeat the report details');

-- Rate limit: 20 in any 24 hours (member_b has no reports yet)
insert into public.reports (reporter_member_id, target_type, target_id, reason, created_at)
select tests.member_id('member_b'), 'member', tests.member_id('member_a'), 'spam', now() - interval '1 hour'
from generate_series(1, 19);
insert into public.reports (reporter_member_id, target_type, target_id, reason, created_at)
select tests.member_id('member_b'), 'member', tests.member_id('member_a'), 'spam', now() - interval '25 hours'
from generate_series(1, 10);
select tests.authenticate_as('member_b');
select lives_ok($$ select public.submit_report('member', tests.member_id('member_a'), 'spam', null) $$,
  'the 20th report in 24 hours is accepted (older reports do not count)');
select throws_ok($$ select public.submit_report('member', tests.member_id('member_a'), 'spam', null) $$,
  'PT429', null, 'the 21st report in 24 hours is refused');
select tests.clear_auth();
select is((select count(*)::int from public.reports where reporter_member_id = tests.member_id('member_b')
  and created_at > now() - interval '24 hours'), 20, 'the refused report was not stored');

-- ---------------------------------------------------------------------------
-- review_report: who may review
-- ---------------------------------------------------------------------------
select tests.authenticate_as('member_a');
select throws_ok($$ select public.review_report(pg_temp.rid('harass'), 'dismiss', null) $$,
  '42501', null, 'a member cannot call review_report');
select tests.authenticate_as('bp_a');
select throws_ok($$ select public.review_report(pg_temp.rid('harass'), 'dismiss', null) $$,
  '42501', null, 'a branch officer without reports.review cannot review');
select tests.authenticate_as('super_admin');
select throws_ok($$ select public.review_report(pg_temp.rid('harass'), 'dismiss', null) $$,
  '42501', null, 'a super admin without a step-up cannot review');
select tests.clear_auth();
select is((select status from public.reports where id = pg_temp.rid('harass')), 'open',
  'the refused reviews left the report open');

select tests.grant_step_up('super_admin');
select tests.authenticate_as('super_admin');
select lives_ok($$ select public.review_report(pg_temp.rid('harass'), 'dismiss', 'Not a breach') $$,
  'a super admin with a step-up can review');
select tests.clear_auth();
select is((select status || ' ' || (assigned_to = tests.member_id('super_admin'))::text || ' ' || (resolved_at is not null)::text
   from public.reports where id = pg_temp.rid('harass')),
  'dismissed true true', 'dismiss closes the report, records the reviewer and the time');
select is(
  (select array_agg(title || ' / ' || coalesce(body, '')) from public.notifications
   where kind = 'report.reviewed' and member_id = tests.member_id('member_a')
     and data ->> 'report_id' = pg_temp.rid('harass')::text),
  array['Your report was reviewed / Thank you. Our team has reviewed your report.'],
  'the reporter gets one generic notification, without the reviewer''s note');
select ok(exists (select 1 from public.audit_log where action = 'report.review' and entity_id = pg_temp.rid('harass')::text
  and details ->> 'action' = 'dismiss'), 'the review is audited');

select tests.authenticate_as('enforcement');
select throws_ok($$ select public.review_report(pg_temp.rid('harass'), 'warn', null) $$,
  '22023', null, 'a closed report cannot be reviewed again');
select throws_ok($$ select public.review_report(pg_temp.rid('safety'), 'ban_forever', null) $$,
  '22023', null, 'an unknown action is rejected');

-- ---------------------------------------------------------------------------
-- block: needs members.block, calls block_member
-- ---------------------------------------------------------------------------
select tests.authenticate_as('mentor');
select throws_ok($$ select public.review_report(pg_temp.rid('safety'), 'block', 'Unsafe') $$,
  '42501', null, 'the mentor (no members.block) cannot block through a report');
select tests.clear_auth();
select is((select status from public.members where id = tests.member_id('member_b')), 'active',
  'the refused block left member B active');
select tests.authenticate_as('enforcement');
select lives_ok($$ select public.review_report(pg_temp.rid('safety'), 'block', 'Unsafe contact with a minor') $$,
  'the enforcement committee can block through a report');
select tests.clear_auth();
select results_eq($$ select status::text, (select reason from public.member_status_events e
                     where e.member_id = m.id and e.to_status = 'suspended')
                     from public.members m where m.id = tests.member_id('member_b') $$,
  $$ values ('suspended', 'Unsafe contact with a minor') $$,
  'block suspended member B through block_member, with the note as the reason');
select is((select status from public.reports where id = pg_temp.rid('safety')), 'resolved', 'block resolves the report');

-- ---------------------------------------------------------------------------
-- remove_content: needs content.remove, sets removed_at / removed_by
-- ---------------------------------------------------------------------------
select tests.authenticate_as('member_a');
insert into tests.p1c_reports
  select 'ann', public.submit_report('announcement', 'd0000000-0000-4000-8000-000000000008', 'misleading', null);
insert into tests.p1c_reports
  select 'ev', public.submit_report('event', 'e0000000-0000-4000-8000-000000000008', 'misleading', null);
insert into tests.p1c_reports
  select 'ann2', public.submit_report('announcement', 'd0000000-0000-4000-8000-000000000003', 'rude', null);
select ok(exists (select 1 from public.announcements where id = 'd0000000-0000-4000-8000-000000000008'),
  'member A sees announcement 08 before the review');

select tests.authenticate_as('enforcement');
select throws_ok($$ select public.review_report(pg_temp.rid('ann'), 'block', null) $$,
  '22023', null, 'block applies only to a member target');
select tests.authenticate_as('mentor');
select lives_ok($$ select public.review_report(pg_temp.rid('ann'), 'remove_content', 'Removed') $$,
  'the mentor removes a reported announcement');
select tests.authenticate_as('enforcement');
select lives_ok($$ select public.review_report(pg_temp.rid('ev'), 'remove_content', null) $$,
  'the enforcement committee removes a reported event');
select tests.clear_auth();
select is((select removed_by from public.announcements where id = 'd0000000-0000-4000-8000-000000000008'
  and removed_at is not null), tests.member_id('mentor'), 'remove_content sets removed_at and removed_by');
select is((select hidden_at from public.announcements where id = 'd0000000-0000-4000-8000-000000000008'),
  null, 'remove_content does not use hidden_at');
select is((select removed_by from public.events where id = 'e0000000-0000-4000-8000-000000000008'
  and removed_at is not null), tests.member_id('enforcement'), 'remove_content works on events too');
select tests.authenticate_as('member_a');
select ok(not exists (select 1 from public.announcements where id = 'd0000000-0000-4000-8000-000000000008'),
  'members no longer see the removed announcement');

-- content.remove is checked on its own: take it from the mentor for this transaction
select tests.clear_auth();
delete from public.role_permissions where role_key = 'mentor' and permission_key = 'content.remove';
select tests.authenticate_as('mentor');
select throws_ok($$ select public.review_report(pg_temp.rid('ann2'), 'remove_content', null) $$,
  '42501', null, 'remove_content needs content.remove, not just reports.review');
select tests.clear_auth();
select is((select removed_at from public.announcements where id = 'd0000000-0000-4000-8000-000000000003'),
  null, 'the refused removal left the announcement in place');

-- warn: a generic warning to the author
select tests.authenticate_as('enforcement');
select lives_ok($$ select public.review_report(pg_temp.rid('ann2'), 'warn', 'First warning') $$,
  'the enforcement committee warns the author of a reported announcement');
select tests.clear_auth();
select is((select count(*)::int from public.notifications
  where kind = 'moderation.warning' and member_id = tests.member_id('national_president')), 1,
  'the author gets one moderation warning');

-- A reviewer cannot close a report about themselves (enforcement holds reports.review).
select tests.authenticate_as('member_a');
insert into tests.p1c_reports
  select 'self', public.submit_report('member', tests.member_id('enforcement'), 'harassment', 'About a reviewer');
select tests.authenticate_as('enforcement');
select is((select status from public.reports where id = pg_temp.rid('self')), 'open',
  'the reviewer can see the report about themselves');
select throws_ok($$ select public.review_report(pg_temp.rid('self'), 'dismiss', 'Nothing to see') $$,
  '42501', null, 'a reviewer cannot dismiss a report about themselves');
select tests.clear_auth();
select is((select status from public.reports where id = pg_temp.rid('self')), 'open',
  'the report about the reviewer is still open');

-- The same for content the reviewer authored or created
insert into public.announcements (id, scope, title, body, published_at, author_member_id)
values ('d0000000-0000-4000-8000-0000000000f7', 'national', 'By enforcement', 'x', now() - interval '1 hour', tests.member_id('enforcement'));
select tests.authenticate_as('member_a');
insert into tests.p1c_reports
  select 'selfann', public.submit_report('announcement', 'd0000000-0000-4000-8000-0000000000f7', 'spam', null);
select tests.authenticate_as('enforcement');
select throws_ok($$ select public.review_report(pg_temp.rid('selfann'), 'dismiss', null) $$,
  '42501', null, 'a reviewer cannot close a report about their own announcement');
select tests.clear_auth();
select is((select status from public.reports where id = pg_temp.rid('selfann')), 'open',
  'the report about the reviewer''s announcement is still open');

select * from finish();
rollback;

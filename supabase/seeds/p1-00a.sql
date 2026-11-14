-- P1-00a seed: app settings, fake events and announcements, and a step-up helper for pgTAP.
-- Content ids: events e0000000-0000-4000-8000-0000000000NN, announcements d0000000-...-NN.
--   01 national youth   02 branch A youth   03 branch B youth   04 national aiaia
--   05 branch A draft   06 branch A hidden   07 national hidden   08 national 'all'
--   09 branch A scheduled (announcement only: published_at in the future)

insert into public.app_settings (key, value, is_public, description) values
  ('grievance_officer', '{"title": "Grievance Officer", "name": null, "email": null, "phone": null, "placeholder": true}'::jsonb,
    true, 'Grievance officer contact shown on the blocked screen and policy pages (placeholder)'),
  ('step_up_roles', '["super_admin"]'::jsonb, false, 'Roles whose permissions count only with a step-up'),
  ('trusted_device_days', 'null'::jsonb, false, 'Trusted-device lifetime in days; null means devices never expire'),
  ('email_daily_cap', '2000'::jsonb, false, 'Emails per day through the primary provider'),
  ('adult_handover_grace_days', '90'::jsonb, false, 'Days a guardian may keep managing a dependent after 18'),
  ('min_app_version', '"0.0.0"'::jsonb, true, 'Oldest app version allowed to run'),
  ('retention_months', '6'::jsonb, false, 'Months rejected and deleted accounts are kept before purge');

-- Dev fixtures already hold member numbers up to 22; real approvals continue after them.
select setval('public.member_no_seq', 100);

insert into public.events (id, scope, branch_id, audience, title, starts_at, ends_at, venue_name, status, hidden_at, created_by)
select
  ('e0000000-0000-4000-8000-' || lpad(v.nn::text, 12, '0'))::uuid,
  v.scope,
  case v.branch when 'a' then 'c0000000-0000-4000-8000-00000000000a'::uuid when 'b' then 'c0000000-0000-4000-8000-00000000000b'::uuid end,
  v.audience::public.audience,
  v.title,
  now() + interval '30 days',
  now() + interval '30 days 4 hours',
  'Community Hall',
  v.status,
  case when v.hidden then now() - interval '1 day' end,
  'a0000000-0000-4000-8000-000000000003'::uuid
from (values
  (1, 'national', null, 'youth', 'National youth meet', 'published', false),
  (2, 'branch', 'a', 'youth', 'Branch A youth meet', 'published', false),
  (3, 'branch', 'b', 'youth', 'Branch B youth meet', 'published', false),
  (4, 'national', null, 'aiaia', 'National AIAIA meet', 'published', false),
  (5, 'branch', 'a', 'youth', 'Branch A draft meet', 'draft', false),
  (6, 'branch', 'a', 'youth', 'Branch A hidden meet', 'published', true),
  (7, 'national', null, 'youth', 'National hidden meet', 'published', true),
  (8, 'national', null, 'all', 'National open meet', 'published', false)
) as v (nn, scope, branch, audience, title, status, hidden);

insert into public.announcements (id, scope, branch_id, audience, title, body, published_at, hidden_at, author_member_id)
select
  ('d0000000-0000-4000-8000-' || lpad(v.nn::text, 12, '0'))::uuid,
  v.scope,
  case v.branch when 'a' then 'c0000000-0000-4000-8000-00000000000a'::uuid when 'b' then 'c0000000-0000-4000-8000-00000000000b'::uuid end,
  v.audience::public.audience,
  v.title,
  'Dev fixture announcement.',
  case v.pub when 'past' then now() - interval '2 days' when 'future' then now() + interval '2 days' end,
  case when v.hidden then now() - interval '1 day' end,
  'a0000000-0000-4000-8000-000000000003'::uuid
from (values
  (1, 'national', null, 'youth', 'National youth notice', 'past', false),
  (2, 'branch', 'a', 'youth', 'Branch A youth notice', 'past', false),
  (3, 'branch', 'b', 'youth', 'Branch B youth notice', 'past', false),
  (4, 'national', null, 'aiaia', 'National AIAIA notice', 'past', false),
  (5, 'branch', 'a', 'youth', 'Branch A draft notice', null, false),
  (6, 'branch', 'a', 'youth', 'Branch A hidden notice', 'past', true),
  (7, 'national', null, 'youth', 'National hidden notice', 'past', true),
  (8, 'national', null, 'all', 'National open notice', 'past', false),
  (9, 'branch', 'a', 'youth', 'Branch A scheduled notice', 'future', false)
) as v (nn, scope, branch, audience, title, pub, hidden);

-- Step-up helper for pgTAP. Matches the session_id claim set by tests.authenticate_as()
-- (supabase/tests/00_helpers.sql). Call it as postgres (tests.clear_auth()).
create schema if not exists tests;

create or replace function tests.session_id(member_key text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select md5('session:' || member_key)::uuid;
$$;
revoke execute on function tests.session_id(text) from public;

-- has_step_up() requires a live auth.sessions row, so the helpers create one for the member's user.
create or replace function tests.ensure_session(member_key text, session uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  sid uuid := coalesce(session, tests.session_id(member_key));
begin
  insert into auth.sessions (id, user_id) values (sid, tests.user_id(member_key)) on conflict (id) do nothing;
  return sid;
end;
$$;
revoke execute on function tests.ensure_session(text, uuid) from public;

create or replace function tests.grant_step_up(member_key text, expires timestamptz default null, session uuid default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.admin_step_ups (session_id, member_id, expires_at, source)
  values (tests.ensure_session(member_key, session), tests.member_id(member_key), expires, 'email_otp');
end;
$$;
revoke execute on function tests.grant_step_up(text, timestamptz, uuid) from public;

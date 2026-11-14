-- P1-00c (part 2): announcement publishing with one-statement notification, push token
-- registration, and the report / moderation flow. Rules: 01-architecture.md 5 and 6.

-- ---------------------------------------------------------------------------
-- Removed content (moderation). Set only by review_report(..., 'remove_content', ...).
-- The columns are deliberately NOT in the officers' update whitelists, so clients cannot clear them.
-- ---------------------------------------------------------------------------
alter table public.announcements
  add column removed_at timestamptz,
  add column removed_by uuid references public.members (id);
alter table public.events
  add column removed_at timestamptz,
  add column removed_by uuid references public.members (id);

drop policy announcements_select_member on public.announcements;
create policy announcements_select_member on public.announcements
  for select to authenticated using (
    (select public.is_active())
    and published_at is not null
    and published_at <= now()
    and hidden_at is null
    and removed_at is null
    and (scope = 'national' or branch_id = (select public.current_member_branch_id()))
    and (audience = 'all' or audience::text = (select public.current_member_wing()))
  );

drop policy events_select_member on public.events;
create policy events_select_member on public.events
  for select to authenticated using (
    (select public.is_active())
    and status in ('published', 'cancelled')
    and hidden_at is null
    and removed_at is null
    and (scope = 'national' or branch_id = (select public.current_member_branch_id()))
    and (audience = 'all' or audience::text = (select public.current_member_wing()))
  );

-- ---------------------------------------------------------------------------
-- publish_announcement(id, notify)
-- ---------------------------------------------------------------------------
-- Publishes a draft or scheduled announcement now. With notify, one notifications row per active
-- audience member goes in with a single INSERT, so the statement-level fan-out wakes
-- notify-dispatch once. Returns the number of notifications created.
create function public.publish_announcement(id uuid, notify boolean default false)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.announcements%rowtype;
  n integer := 0;
begin
  select * into a from public.announcements x where x.id = publish_announcement.id for update;
  -- Same answer for "no such row" and "not yours", so ids cannot be probed.
  if not found or not (
    (a.scope = 'national' and public.has_permission('announcements.national'))
    or (a.scope = 'branch' and public.has_permission('announcements.branch', a.branch_id))
  ) then
    raise exception 'not allowed to publish this announcement' using errcode = '42501';
  end if;
  if a.removed_at is not null or a.hidden_at is not null then
    raise exception 'a hidden or removed announcement cannot be published' using errcode = '22023';
  end if;
  if a.published_at is not null and a.published_at <= now() then
    raise exception 'announcement is already published' using errcode = '22023';
  end if;

  update public.announcements x set published_at = now() where x.id = a.id;

  if coalesce(publish_announcement.notify, false) then
    insert into public.notifications (member_id, kind, title, data)
    select m.id, 'announcement.published', a.title, jsonb_build_object('announcement_id', a.id)
    from public.members m
    where m.status = 'active'
      and (a.scope = 'national' or m.branch_id = a.branch_id)
      and (a.audience = 'all' or m.wing = a.audience::text);
    get diagnostics n = row_count;
  end if;

  perform public.write_audit('announcement.publish', 'announcements', a.id::text,
    jsonb_build_object('notify', coalesce(publish_announcement.notify, false), 'notified', n));
  return n;
end;
$$;
revoke execute on function public.publish_announcement(uuid, boolean) from public, anon;
grant execute on function public.publish_announcement(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- register_push_token(token, platform, subscription)
-- ---------------------------------------------------------------------------
-- Upsert of the caller's device. A token (or web-push endpoint) already registered to another
-- member moves to the caller: one device, one recipient. Pending applicants may register so they
-- can hear the outcome of their application; deleted accounts may not.
create function public.register_push_token(token text, platform text, subscription jsonb default null)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_member_id();
  prev_owner uuid;
  row_id uuid;
begin
  if me is null or exists (select 1 from public.members m where m.id = me and m.status = 'deleted') then
    raise exception 'no member account for this session' using errcode = '42501';
  end if;
  if register_push_token.platform is null or register_push_token.platform not in ('android', 'ios', 'web') then
    raise exception 'platform must be android, ios or web' using errcode = '22023';
  end if;

  if register_push_token.platform = 'web' then
    if register_push_token.token is not null
      or register_push_token.subscription is null
      or jsonb_typeof(register_push_token.subscription) <> 'object'
      or coalesce(register_push_token.subscription ->> 'endpoint', '') !~ '^https://'
      or length(register_push_token.subscription::text) > 4000 then
      raise exception 'web push needs a subscription object with an https endpoint and no token'
        using errcode = '22023';
    end if;
    select t.member_id into prev_owner from public.push_tokens t
      where t.subscription ->> 'endpoint' = register_push_token.subscription ->> 'endpoint';
    insert into public.push_tokens as t (member_id, platform, subscription, last_seen_at)
    values (me, 'web', register_push_token.subscription, now())
    on conflict ((subscription ->> 'endpoint')) where subscription is not null
    do update set member_id = excluded.member_id, subscription = excluded.subscription, last_seen_at = now()
    returning t.id into row_id;
  else
    if register_push_token.token is null or length(register_push_token.token) not between 1 and 512
      or register_push_token.subscription is not null then
      raise exception 'a device token of 1-512 characters is required' using errcode = '22023';
    end if;
    select t.member_id into prev_owner from public.push_tokens t where t.token = register_push_token.token;
    insert into public.push_tokens as t (member_id, platform, token, last_seen_at)
    values (me, register_push_token.platform, register_push_token.token, now())
    on conflict (token) where token is not null
    do update set member_id = excluded.member_id, platform = excluded.platform, last_seen_at = now()
    returning t.id into row_id;
  end if;

  if prev_owner is not null and prev_owner <> me then
    perform public.write_audit('push_token.move', 'push_tokens', row_id::text,
      jsonb_build_object('from_member_id', prev_owner, 'platform', register_push_token.platform));
  end if;
  return row_id;
end;
$$;
revoke execute on function public.register_push_token(text, text, jsonb) from public, anon;
grant execute on function public.register_push_token(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_report(target_type, target_id, reason, details)
-- ---------------------------------------------------------------------------
-- Any active member, at most 20 reports in any rolling 24 hours (SQLSTATE PT429, which PostgREST
-- returns as HTTP 429). 'block_request' is reserved for request_block (P1-00b). 'safety_minor'
-- alerts every active holder of members.block with a high-priority notification that carries no
-- details about the reporter or the target.
create function public.submit_report(target_type text, target_id uuid, reason text, details text default null)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_member_id();
  why text := lower(btrim(coalesce(submit_report.reason, '')));
  report_id uuid;
begin
  if not public.is_active() then
    raise exception 'reports are for active members only' using errcode = '42501';
  end if;
  if submit_report.target_type is null or submit_report.target_type !~ '^[a-z][a-z_]{0,39}$'
    or submit_report.target_id is null then
    raise exception 'target_type and target_id are required' using errcode = '22023';
  end if;
  if length(why) not between 1 and 100 then
    raise exception 'reason must be 1-100 characters' using errcode = '22023';
  end if;
  if why = 'block_request' then
    raise exception 'block requests are made with request_block' using errcode = '22023';
  end if;
  if submit_report.details is not null and length(submit_report.details) > 2000 then
    raise exception 'details must be at most 2000 characters' using errcode = '22023';
  end if;

  -- Serialise one reporter's submissions so the limit holds under concurrency.
  perform pg_advisory_xact_lock(hashtextextended('submit_report:' || me::text, 0));
  if (select count(*) from public.reports r
      where r.reporter_member_id = me and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'report limit reached: at most 20 reports a day' using errcode = 'PT429';
  end if;

  insert into public.reports (reporter_member_id, target_type, target_id, reason, details)
  values (me, submit_report.target_type, submit_report.target_id, why, nullif(btrim(submit_report.details), ''))
  returning id into report_id;

  if why = 'safety_minor' then
    insert into public.notifications (member_id, kind, priority, title, body, data)
    select distinct m.id, 'report.safety_minor', 'high', 'Safety report needs review',
      'A report about the safety of a minor was submitted. Open the moderation queue.',
      jsonb_build_object('report_id', report_id)
    from public.members m
    join public.role_assignments ra on ra.member_id = m.id
    join public.role_permissions rp on rp.role_key = ra.role_key
    where m.status = 'active'
      and rp.permission_key = 'members.block'
      and ra.starts_on <= (now() at time zone 'Asia/Kolkata')::date
      and (ra.ends_on is null or ra.ends_on >= (now() at time zone 'Asia/Kolkata')::date);
  end if;

  perform public.write_audit('report.submit', 'reports', report_id::text,
    jsonb_build_object('target_type', submit_report.target_type, 'reason', why));
  return report_id;
end;
$$;
revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- review_report(id, action, note)
-- ---------------------------------------------------------------------------
-- reports.review closes an open report. remove_content additionally needs content.remove and
-- applies to announcements and events; block additionally needs members.block and applies to a
-- member, through block_member (P1-00b). warn sends the responsible member a generic warning.
-- The reporter always gets the same generic "reviewed" notification, whatever the outcome.
create function public.review_report(id uuid, action text, note text default null)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_member_id();
  r public.reports%rowtype;
  clean_note text := nullif(btrim(coalesce(review_report.note, '')), '');
  responsible uuid;
begin
  if not public.has_permission('reports.review') then
    raise exception 'not allowed to review reports' using errcode = '42501';
  end if;
  if review_report.action is null or review_report.action not in ('dismiss', 'warn', 'remove_content', 'block') then
    raise exception 'action must be dismiss, warn, remove_content or block' using errcode = '22023';
  end if;
  if clean_note is not null and length(clean_note) > 2000 then
    raise exception 'note must be at most 2000 characters' using errcode = '22023';
  end if;

  select * into r from public.reports x where x.id = review_report.id for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if r.status not in ('open', 'in_review') then
    raise exception 'report is already closed' using errcode = '22023';
  end if;
  -- A reviewer may not close a report about themselves or about their own content.
  if (r.target_type = 'member' and r.target_id = me)
     or (r.target_type = 'announcement'
         and exists (select 1 from public.announcements x where x.id = r.target_id and x.author_member_id = me))
     or (r.target_type = 'event'
         and exists (select 1 from public.events x where x.id = r.target_id and x.created_by = me)) then
    raise exception 'you cannot review a report about yourself' using errcode = '42501';
  end if;

  if review_report.action = 'remove_content' then
    if not public.has_permission('content.remove') then
      raise exception 'not allowed to remove content' using errcode = '42501';
    end if;
    if r.target_type = 'announcement' then
      update public.announcements x set removed_at = now(), removed_by = me
        where x.id = r.target_id and x.removed_at is null;
    elsif r.target_type = 'event' then
      update public.events x set removed_at = now(), removed_by = me
        where x.id = r.target_id and x.removed_at is null;
    else
      raise exception 'only announcements and events can be removed' using errcode = '22023';
    end if;
    if not found then
      raise exception 'content not found or already removed' using errcode = '22023';
    end if;
  elsif review_report.action = 'block' then
    if not public.has_permission('members.block') then
      raise exception 'not allowed to block members' using errcode = '42501';
    end if;
    if r.target_type <> 'member' then
      raise exception 'only a member can be blocked' using errcode = '22023';
    end if;
    perform public.block_member(r.target_id, coalesce(clean_note, 'Blocked after report review'));
  elsif review_report.action = 'warn' then
    responsible := case r.target_type
      when 'member' then (select m.id from public.members m where m.id = r.target_id)
      when 'announcement' then (select x.author_member_id from public.announcements x where x.id = r.target_id)
      when 'event' then (select x.created_by from public.events x where x.id = r.target_id)
    end;
    if responsible is not null then
      insert into public.notifications (member_id, kind, title, body)
      values (responsible, 'moderation.warning', 'A note from the moderation team',
        'Something you posted or did was reported and reviewed. Please follow the community guidelines.');
    end if;
  end if;

  update public.reports x
    set status = case when review_report.action = 'dismiss' then 'dismissed' else 'resolved' end,
        assigned_to = me,
        resolution_note = clean_note,
        resolved_at = now()
    where x.id = r.id;

  insert into public.notifications (member_id, kind, title, body, data)
  values (r.reporter_member_id, 'report.reviewed', 'Your report was reviewed',
    'Thank you. Our team has reviewed your report.', jsonb_build_object('report_id', r.id));

  perform public.write_audit('report.review', 'reports', r.id::text,
    jsonb_build_object('action', review_report.action, 'target_type', r.target_type, 'target_id', r.target_id));
end;
$$;
revoke execute on function public.review_report(uuid, text, text) from public, anon;
grant execute on function public.review_report(uuid, text, text) to authenticated;

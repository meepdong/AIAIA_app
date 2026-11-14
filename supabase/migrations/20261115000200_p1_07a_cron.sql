-- P1-07a: event reminders (hourly cron -> event-reminders function -> send_event_reminders),
-- notifications for event cancellation and waitlist promotion, and the read RPCs the events screens
-- need (spots left, attendee list, event team, "my event duties"). Rules: 01-architecture.md 5 and 7.
--
-- Notification text carries only the event title, time and venue: no phone, DOB, amount or any
-- other member's details. A dependent without a login is reached through their guardians by the
-- notifications fan-out trigger (P1-00c).

-- ---------------------------------------------------------------------------
-- Ledger: one row per reminder sent, so a re-run (or an overlapping cron) never sends twice.
-- ---------------------------------------------------------------------------
create table public.event_reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('24h', '2h')),
  sent_at timestamptz not null default now(),
  primary key (event_id, member_id, kind)
);
alter table public.event_reminders_sent enable row level security;
revoke all on public.event_reminders_sent from anon, authenticated;
grant select, insert, update, delete on public.event_reminders_sent to service_role;

-- A rescheduled event is a new occasion: forget what was sent so the reminders run again.
create function public.events_reset_reminders()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.event_reminders_sent r where r.event_id = new.id;
  return null;
end;
$$;
revoke execute on function public.events_reset_reminders() from public, anon, authenticated;

create trigger events_reset_reminders
  after update of starts_at on public.events
  for each row when (old.starts_at is distinct from new.starts_at)
  execute function public.events_reset_reminders();

-- ---------------------------------------------------------------------------
-- send_event_reminders(reminder_kind): service role only (the event-reminders function).
-- '24h': published events starting within 24 h but not within 2 h (the 2 h reminder covers those).
-- '2h' : published events starting within 2 h; high priority.
-- Goes to every 'going' registrant (a dependent's notification reaches their guardians) who has
-- not had this reminder. Ledger insert and notification insert are one statement, so they commit
-- together. Returns the number of reminders sent by this call.
-- ---------------------------------------------------------------------------
create function public.send_event_reminders(reminder_kind text)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if send_event_reminders.reminder_kind is null or send_event_reminders.reminder_kind not in ('24h', '2h') then
    raise exception 'reminder_kind must be 24h or 2h' using errcode = '22023';
  end if;

  with due as (
    select e.id, e.title, e.starts_at, e.venue_name
    from public.events e
    where e.status = 'published' and e.hidden_at is null and e.removed_at is null
      and e.starts_at > now()
      and case send_event_reminders.reminder_kind
            when '24h' then e.starts_at <= now() + interval '24 hours' and e.starts_at > now() + interval '2 hours'
            else e.starts_at <= now() + interval '2 hours'
          end
  ),
  fresh as (
    insert into public.event_reminders_sent (event_id, member_id, kind)
    select d.id, r.member_id, send_event_reminders.reminder_kind
    from due d
    join public.rsvps r on r.event_id = d.id and r.status = 'going'
    join public.members m on m.id = r.member_id and m.status = 'active'
    on conflict do nothing
    returning event_id, member_id
  ),
  sent as (
    insert into public.notifications (member_id, kind, priority, title, body, data)
    select f.member_id,
      'event.reminder_' || send_event_reminders.reminder_kind,
      case send_event_reminders.reminder_kind when '2h' then 'high' else 'normal' end,
      'Reminder: ' || d.title,
      'Starts ' || to_char(d.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM')
        || coalesce(' at ' || d.venue_name, ''),
      jsonb_build_object('event_id', f.event_id, 'member_id', f.member_id)
    from fresh f
    join due d on d.id = f.event_id
    returning 1
  )
  select count(*) into n from sent;

  if n > 0 then
    perform public.write_audit('event.reminders_sent', 'events', null,
      jsonb_build_object('kind', send_event_reminders.reminder_kind, 'sent', n));
  end if;
  return n;
end;
$$;
revoke execute on function public.send_event_reminders(text) from public, anon, authenticated;
grant execute on function public.send_event_reminders(text) to service_role;

-- ---------------------------------------------------------------------------
-- Hourly wake-up of the event-reminders function (same pattern as wake_notify_dispatch). URL and
-- secret come from app_settings (event_reminders_url, event_reminders_secret). Unlike the notify
-- sweep, a missing setting is reported, since reminders would otherwise stop silently.
-- ---------------------------------------------------------------------------
create function public.wake_event_reminders()
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select s.value #>> '{}' into fn_url from public.app_settings s where s.key = 'event_reminders_url';
  select s.value #>> '{}' into fn_secret from public.app_settings s where s.key = 'event_reminders_secret';
  if fn_url is null or nullif(fn_secret, '') is null then
    raise warning 'event-reminders wake-up skipped: event_reminders_url or event_reminders_secret is not set';
    return;
  end if;
  if fn_url !~ '^https://' and fn_url !~ '^http://(kong|localhost|127\.0\.0\.1)(:[0-9]+)?(/|$)' then
    raise warning 'event-reminders wake-up skipped: url must be https';
    return;
  end if;
  begin
    perform net.http_post(
      url := fn_url,
      body := '{"reason": "cron"}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminders-secret', fn_secret),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'event-reminders wake-up failed: %', sqlerrm;
  end;
end;
$$;
revoke execute on function public.wake_event_reminders() from public, anon, authenticated;

select cron.schedule('event-reminders-hourly', '5 * * * *', $$select public.wake_event_reminders()$$);

-- ---------------------------------------------------------------------------
-- Cancellation: every going or waitlisted registrant is told, at high priority. Fires for any path
-- that sets the status (the admin screen, an RPC), once per transition.
-- ---------------------------------------------------------------------------
create function public.events_notify_cancelled()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (member_id, kind, priority, title, body, data)
  select r.member_id, 'event.cancelled', 'high',
    'Event cancelled: ' || new.title,
    'This event, planned for ' || to_char(new.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM')
      || ', has been cancelled.',
    jsonb_build_object('event_id', new.id, 'member_id', r.member_id)
  from public.rsvps r
  join public.members m on m.id = r.member_id and m.status = 'active'
  where r.event_id = new.id and r.status in ('going', 'waitlisted');
  return null;
end;
$$;
revoke execute on function public.events_notify_cancelled() from public, anon, authenticated;

create trigger events_notify_cancelled
  after update of status on public.events
  for each row when (old.status is distinct from new.status and new.status = 'cancelled')
  execute function public.events_notify_cancelled();

-- ---------------------------------------------------------------------------
-- Waitlist promotion: rsvp() moves the longest-waiting member to 'going' when a place opens. They
-- are told (README follow-up). Priority is high when the event is within 24 h.
-- ---------------------------------------------------------------------------
create function public.rsvps_notify_promoted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
begin
  select * into e from public.events x where x.id = new.event_id;
  if e.status <> 'published' or e.hidden_at is not null or e.removed_at is not null then
    return null;
  end if;
  insert into public.notifications (member_id, kind, priority, title, body, data)
  select new.member_id, 'event.waitlist_promoted',
    case when e.starts_at <= now() + interval '24 hours' then 'high' else 'normal' end,
    'A place opened up: ' || e.title,
    'You are now registered for ' || to_char(e.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM') || '.',
    jsonb_build_object('event_id', e.id, 'member_id', new.member_id)
  where exists (select 1 from public.members m where m.id = new.member_id and m.status = 'active');
  return null;
end;
$$;
revoke execute on function public.rsvps_notify_promoted() from public, anon, authenticated;

create trigger rsvps_notify_promoted
  after update of status on public.rsvps
  for each row when (old.status = 'waitlisted' and new.status = 'going')
  execute function public.rsvps_notify_promoted();

-- ---------------------------------------------------------------------------
-- event_spots(event_ids): going and waitlisted counts for events the caller may see (members: the
-- member select policy's rule; scope officers: their events). Counts only, never identities.
-- ---------------------------------------------------------------------------
create function public.event_spots(event_ids uuid[])
returns table (event_id uuid, going integer, waitlisted integer)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if cardinality(event_spots.event_ids) > 200 then
    raise exception 'event_spots takes at most 200 event ids' using errcode = '54000';
  end if;
  return query
  select e.id,
    count(*) filter (where r.status = 'going')::integer,
    count(*) filter (where r.status = 'waitlisted')::integer
  from public.events e
  left join public.rsvps r on r.event_id = e.id
  where e.id = any (event_spots.event_ids)
    and (
      public.is_event_officer(e.id)
      or (
        public.is_active()
        and e.status in ('published', 'cancelled') and e.hidden_at is null and e.removed_at is null
        and (e.scope = 'national' or e.branch_id = public.current_member_branch_id())
        and (e.audience = 'all' or e.audience::text = public.current_member_wing())
      )
    )
  group by e.id;
end;
$$;
revoke execute on function public.event_spots(uuid[]) from public, anon;
grant execute on function public.event_spots(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- event_attendees(event_id): the scope officers' attendee list (and CSV export). No phone, DOB or
-- email. Audited, since it lists members.
-- ---------------------------------------------------------------------------
create function public.event_attendees(event_id uuid)
returns table (
  member_id uuid,
  full_name text,
  member_no text,
  branch_name text,
  status text,
  registered_at timestamptz,
  registered_by_guardian boolean
)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if event_attendees.event_id is null or not public.is_event_officer(event_attendees.event_id) then
    raise exception 'not allowed to see this event''s attendees' using errcode = '42501';
  end if;
  if (select count(*) from public.rsvps x where x.event_id = event_attendees.event_id) > 5000 then
    raise exception 'too many attendees to list (limit 5000)' using errcode = '54000';
  end if;
  perform public.write_audit('event.attendees_read', 'events', event_attendees.event_id::text);
  return query
    select m.id, m.full_name, m.member_no, b.name, r.status, r.created_at,
      (r.created_by is not null and r.created_by <> r.member_id)
    from public.rsvps r
    join public.members m on m.id = r.member_id
    join public.branches b on b.id = m.branch_id
    where r.event_id = event_attendees.event_id
    order by r.status, r.created_at, m.id;
end;
$$;
revoke execute on function public.event_attendees(uuid) from public, anon;
grant execute on function public.event_attendees(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- event_team(event_id): the event's staff with names, for the scope officers.
-- ---------------------------------------------------------------------------
create function public.event_team(event_id uuid)
returns table (member_id uuid, full_name text, branch_name text, capabilities text[])
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if event_team.event_id is null or not public.is_event_officer(event_team.event_id) then
    raise exception 'not allowed to see this event''s team' using errcode = '42501';
  end if;
  return query
    select m.id, m.full_name, b.name, s.capabilities
    from public.event_staff s
    join public.members m on m.id = s.member_id
    join public.branches b on b.id = m.branch_id
    where s.event_id = event_team.event_id
    order by m.full_name, m.id;
end;
$$;
revoke execute on function public.event_team(uuid) from public, anon;
grant execute on function public.event_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- my_event_duties(): events the caller is listed staff for (any branch: the events select policy
-- would hide another branch's event from them). Upcoming, or ended within the last day.
-- ---------------------------------------------------------------------------
create function public.my_event_duties()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  capabilities text[]
)
language sql stable security definer
set search_path = ''
as $$
  select e.id, e.title, e.starts_at, e.ends_at, e.venue_name, s.capabilities
  from public.event_staff s
  join public.events e on e.id = s.event_id
  where public.is_active()
    and s.member_id = public.current_member_id()
    and e.status = 'published' and e.hidden_at is null and e.removed_at is null
    and e.ends_at > now() - interval '1 day'
  order by e.starts_at, e.id;
$$;
revoke execute on function public.my_event_duties() from public, anon;
grant execute on function public.my_event_duties() to authenticated;

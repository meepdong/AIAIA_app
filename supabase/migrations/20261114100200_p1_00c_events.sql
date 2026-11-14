-- P1-00c (part 3): RSVPs, the event team, the offline check-in pack and sync, and digital member
-- ID verification. Rules: 01-architecture.md 5 and 6.
--
-- Errors follow parts 1 and 2: 42501 for "no such row" and "not allowed" alike (ids cannot be
-- probed), 22023 for bad arguments or a state the caller may know about.

-- ---------------------------------------------------------------------------
-- is_event_staff(event, capability): the event's scope officers, or listed staff holding the
-- capability for that event. Confers nothing outside the event.
-- ---------------------------------------------------------------------------
create function public.is_event_staff(event uuid, capability text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_event_officer(is_event_staff.event)
    or public.is_listed_event_staff(is_event_staff.event, array[is_event_staff.capability]);
$$;
revoke execute on function public.is_event_staff(uuid, text) from public, anon;
grant execute on function public.is_event_staff(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- rsvp(event_id, member_id, status)
-- ---------------------------------------------------------------------------
-- The caller RSVPs for themself or for a ward on an ACTIVE guardian link. The event must be
-- published, not hidden or removed, and open to the member (scope and audience). 'going' needs an
-- open registration window (no close time means "until the event ends"); when the event is full
-- the RSVP is waitlisted. Cancelling a 'going' RSVP promotes the longest-waiting waitlisted one.
-- Returns the member's resulting status.
create function public.rsvp(event_id uuid, member_id uuid, status text default 'going')
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_member_id();
  e public.events%rowtype;
  m public.members%rowtype;
  cur text;
  result text;
  going_count integer;
  promoted uuid;
begin
  if not public.is_active() then
    raise exception 'only active members can RSVP' using errcode = '42501';
  end if;
  if rsvp.status is null or rsvp.status not in ('going', 'cancelled') then
    raise exception 'status must be going or cancelled' using errcode = '22023';
  end if;
  if rsvp.member_id is null or not (rsvp.member_id = me or public.is_guardian_of(rsvp.member_id)) then
    raise exception 'not allowed to RSVP for this member' using errcode = '42501';
  end if;

  select * into m from public.members x where x.id = rsvp.member_id;
  if not found or m.status <> 'active' then
    raise exception 'not allowed to RSVP for this member' using errcode = '42501';
  end if;

  -- The row lock serialises RSVPs per event, so capacity cannot be overrun.
  select * into e from public.events x where x.id = rsvp.event_id for update;
  if not found
    or e.status <> 'published' or e.hidden_at is not null or e.removed_at is not null
    or not (e.scope = 'national' or e.branch_id = m.branch_id)
    or not (e.audience = 'all' or e.audience::text = m.wing) then
    raise exception 'event not found' using errcode = '42501';
  end if;

  select r.status into cur from public.rsvps r
    where r.event_id = e.id and r.member_id = m.id for update;

  if rsvp.status = 'cancelled' then
    if cur is null or cur = 'cancelled' then
      return 'cancelled';
    end if;
    update public.rsvps r set status = 'cancelled' where r.event_id = e.id and r.member_id = m.id;
    if cur = 'going' and e.capacity is not null then
      update public.rsvps r set status = 'going'
      where (r.event_id, r.member_id) = (
        select w.event_id, w.member_id from public.rsvps w
        where w.event_id = e.id and w.status = 'waitlisted'
        order by w.updated_at, w.created_at, w.member_id
        limit 1
      )
      returning r.member_id into promoted;
    end if;
    perform public.write_audit('event.rsvp', 'events', e.id::text,
      jsonb_build_object('member_id', m.id, 'status', 'cancelled', 'by_guardian', m.id <> me,
        'promoted_member_id', promoted));
    return 'cancelled';
  end if;

  if cur in ('going', 'waitlisted') then
    return cur;
  end if;
  if (e.registration_opens_at is not null and e.registration_opens_at > now())
    or coalesce(e.registration_closes_at, e.ends_at) <= now() then
    raise exception 'registration is not open' using errcode = '22023';
  end if;

  select count(*) into going_count from public.rsvps r where r.event_id = e.id and r.status = 'going';
  result := case when e.capacity is not null and going_count >= e.capacity then 'waitlisted' else 'going' end;

  insert into public.rsvps as r (event_id, member_id, status, created_by)
  values (e.id, m.id, result, me)
  on conflict (event_id, member_id) do update set status = excluded.status, created_by = excluded.created_by;

  perform public.write_audit('event.rsvp', 'events', e.id::text,
    jsonb_build_object('member_id', m.id, 'status', result, 'by_guardian', m.id <> me));
  return result;
end;
$$;
revoke execute on function public.rsvp(uuid, uuid, text) from public, anon;
grant execute on function public.rsvp(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_event_staff / remove_event_staff: the event's scope officers manage its team. Staff may be
-- active members of any branch.
-- ---------------------------------------------------------------------------
create function public.set_event_staff(event_id uuid, member_id uuid, capabilities text[])
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caps text[];
begin
  if set_event_staff.event_id is null or not public.is_event_officer(set_event_staff.event_id) then
    raise exception 'not allowed to manage this event''s team' using errcode = '42501';
  end if;
  if set_event_staff.capabilities is null
    or cardinality(set_event_staff.capabilities) = 0
    or array_position(set_event_staff.capabilities, null) is not null
    or not (set_event_staff.capabilities <@ array['check_in', 'collect_payments', 'safety_lead']::text[]) then
    raise exception 'capabilities must be a non-empty set of check_in, collect_payments, safety_lead'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.members m where m.id = set_event_staff.member_id and m.status = 'active'
  ) then
    raise exception 'staff must be an active member' using errcode = '22023';
  end if;

  select array_agg(distinct c order by c) into caps from unnest(set_event_staff.capabilities) c;

  insert into public.event_staff as s (event_id, member_id, capabilities, added_by)
  values (set_event_staff.event_id, set_event_staff.member_id, caps, public.current_member_id())
  on conflict (event_id, member_id) do update set capabilities = excluded.capabilities, added_by = excluded.added_by;

  perform public.write_audit('event.staff_set', 'events', set_event_staff.event_id::text,
    jsonb_build_object('member_id', set_event_staff.member_id, 'capabilities', to_jsonb(caps)));
end;
$$;
revoke execute on function public.set_event_staff(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_event_staff(uuid, uuid, text[]) to authenticated;

-- Returns whether a team member was removed.
create function public.remove_event_staff(event_id uuid, member_id uuid)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  n integer;
begin
  if remove_event_staff.event_id is null or not public.is_event_officer(remove_event_staff.event_id) then
    raise exception 'not allowed to manage this event''s team' using errcode = '42501';
  end if;
  delete from public.event_staff s
  where s.event_id = remove_event_staff.event_id and s.member_id = remove_event_staff.member_id;
  get diagnostics n = row_count;
  if n > 0 then
    perform public.write_audit('event.staff_remove', 'events', remove_event_staff.event_id::text,
      jsonb_build_object('member_id', remove_event_staff.member_id));
  end if;
  return n > 0;
end;
$$;
revoke execute on function public.remove_event_staff(uuid, uuid) from public, anon;
grant execute on function public.remove_event_staff(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- event_pack(event_id): what a check-in device downloads before going offline. One row per active
-- registrant ('going'). No phone, DOB or email: the age group is derived here, and a member with no
-- DOB on record counts as under-14 (fail closed, like is_minor).
-- ---------------------------------------------------------------------------
create function public.event_pack(event_id uuid)
returns table (
  member_id uuid,
  full_name text,
  member_no text,
  branch_name text,
  age_group text,
  pass_version integer,
  photo_path text,
  guardian_names text[]
)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.events%rowtype;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  n integer;
begin
  if event_pack.event_id is null or not public.is_event_staff(event_pack.event_id, 'check_in') then
    raise exception 'not allowed to check in for this event' using errcode = '42501';
  end if;
  select * into e from public.events x where x.id = event_pack.event_id;
  if e.status <> 'published' or e.hidden_at is not null or e.removed_at is not null then
    raise exception 'event is not open for check-in' using errcode = '22023';
  end if;
  if now() > e.ends_at + interval '1 day' then
    raise exception 'the event has ended' using errcode = '42501';
  end if;

  return query
    select
      m.id,
      m.full_name,
      m.member_no,
      b.name,
      case
        when mp.dob is null then 'under-14'
        when mp.dob <= (today - interval '18 years')::date then 'adult'
        when mp.dob <= (today - interval '14 years')::date then '14-17'
        else 'under-14'
      end,
      m.pass_version,
      m.photo_path,
      array(
        select g.full_name
        from public.member_guardians mg
        join public.members g on g.id = mg.guardian_member_id
        where mg.member_id = m.id and mg.ended_at is null and g.status = 'active'
        order by g.full_name
      )
    from public.rsvps r
    join public.members m on m.id = r.member_id
    join public.branches b on b.id = m.branch_id
    left join public.member_private mp on mp.member_id = m.id
    where r.event_id = e.id and r.status = 'going' and m.status = 'active'
    order by m.full_name, m.id;
  get diagnostics n = row_count;

  perform public.write_audit('event.pack', 'events', e.id::text, jsonb_build_object('rows', n));
end;
$$;
revoke execute on function public.event_pack(uuid) from public, anon;
grant execute on function public.event_pack(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sync_check_ins(event_id, rows): uploads offline scans.
-- ---------------------------------------------------------------------------
-- rows: [{client_ref, member_id, pass_version, scanned_at, walk_in}], at most 500.
-- Idempotent by client_ref: a client_ref already stored for the same member and event is accepted
-- again; one stored for anything else is rejected. One check-in per member per event; the earliest
-- scan wins (the row takes that scan's time, scanner and client_ref). A scan of a member without a
-- 'going' RSVP is stored as a walk-in. Returns {accepted: [client_ref], rejected: [{client_ref, reason}]}.
create function public.sync_check_ins(event_id uuid, rows jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_member_id();
  e public.events%rowtype;
  r jsonb;
  ref uuid;
  mid uuid;
  pv integer;
  scanned timestamptz;
  walk boolean;
  bad boolean;
  prior public.check_ins%rowtype;
  cur_pv integer;
  cur_status public.member_status;
  cur_branch uuid;
  accepted jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
begin
  if sync_check_ins.event_id is null or not public.is_event_staff(sync_check_ins.event_id, 'check_in') then
    raise exception 'not allowed to check in for this event' using errcode = '42501';
  end if;
  -- The row lock serialises syncs per event, so the earliest-scan rule cannot race.
  select * into e from public.events x where x.id = sync_check_ins.event_id for update;
  if e.status <> 'published' or e.hidden_at is not null or e.removed_at is not null then
    raise exception 'event is not open for check-in' using errcode = '22023';
  end if;
  if sync_check_ins.rows is null or jsonb_typeof(sync_check_ins.rows) <> 'array'
    or jsonb_array_length(sync_check_ins.rows) > 500 then
    raise exception 'rows must be an array of at most 500 scans' using errcode = '22023';
  end if;

  for r in select x.value from jsonb_array_elements(sync_check_ins.rows) x loop
    bad := false;
    begin
      ref := (r ->> 'client_ref')::uuid;
      mid := (r ->> 'member_id')::uuid;
      pv := (r ->> 'pass_version')::integer;
      scanned := coalesce((r ->> 'scanned_at')::timestamptz, now());
      walk := coalesce((r ->> 'walk_in')::boolean, false);
    exception
      when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
        or numeric_value_out_of_range or invalid_parameter_value then
        bad := true;
    end;
    if bad or ref is null or mid is null or pv is null then
      rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', r -> 'client_ref', 'reason', 'invalid_row'));
      continue;
    end if;
    if not isfinite(scanned) or scanned > now() + interval '10 minutes'
      or scanned < e.starts_at - interval '12 hours' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', ref, 'reason', 'invalid_scanned_at'));
      continue;
    end if;

    select * into prior from public.check_ins c where c.client_ref = ref;
    if found then
      if prior.event_id = e.id and prior.member_id = mid then
        accepted := accepted || jsonb_build_array(ref);
      else
        rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', ref, 'reason', 'client_ref_conflict'));
      end if;
      continue;
    end if;

    select m.pass_version, m.status, m.branch_id into cur_pv, cur_status, cur_branch from public.members m where m.id = mid;
    if not found or cur_status <> 'active' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', ref, 'reason', 'member_not_active'));
      continue;
    end if;
    if pv <> cur_pv then
      rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', ref, 'reason', 'stale_pass'));
      continue;
    end if;

    walk := walk or not exists (
      select 1 from public.rsvps v where v.event_id = e.id and v.member_id = mid and v.status = 'going'
    );
    if walk and e.scope = 'branch' and cur_branch is distinct from e.branch_id then
      rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', ref, 'reason', 'out_of_scope'));
      continue;
    end if;
    begin
      insert into public.check_ins as c (event_id, member_id, checked_in_at, checked_in_by, source, walk_in, client_ref)
      values (e.id, mid, scanned, me, 'offline_sync', walk, ref)
      on conflict (event_id, member_id) do update
        set checked_in_at = excluded.checked_in_at,
            checked_in_by = excluded.checked_in_by,
            source = excluded.source,
            walk_in = excluded.walk_in,
            client_ref = excluded.client_ref
        where excluded.checked_in_at < c.checked_in_at;
      accepted := accepted || jsonb_build_array(ref);
    exception
      when unique_violation then
        -- The client_ref was stored for another event by a concurrent sync.
        rejected := rejected || jsonb_build_array(jsonb_build_object('client_ref', ref, 'reason', 'client_ref_conflict'));
    end;
  end loop;

  perform public.write_audit('event.check_in_sync', 'events', e.id::text,
    jsonb_build_object('accepted', jsonb_array_length(accepted), 'rejected', jsonb_array_length(rejected)));
  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end;
$$;
revoke execute on function public.sync_check_ins(uuid, jsonb) from public, anon;
grant execute on function public.sync_check_ins(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- verify_member_id(member_id, pass_version): checks a scanned digital member ID.
-- ---------------------------------------------------------------------------
-- Any active holder of members.verify_id, whatever branch the grant is for, may verify any member.
-- Never returns a phone, DOB or email. A deleted account returns only its status. Every call is
-- audited.
create function public.verify_member_id(member_id uuid, pass_version integer)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  m public.members%rowtype;
  home text;
  cur boolean := false;
  ok boolean := false;
  result jsonb;
begin
  if not exists (select 1 from public.my_permissions() p where p.permission_key = 'members.verify_id') then
    raise exception 'not allowed to verify member IDs' using errcode = '42501';
  end if;
  if verify_member_id.member_id is null then
    raise exception 'member_id is required' using errcode = '22023';
  end if;

  select * into m from public.members x where x.id = verify_member_id.member_id;
  if found and m.status in ('active', 'suspended') then
    select b.name into home from public.branches b where b.id = m.branch_id;
    cur := coalesce(m.pass_version = verify_member_id.pass_version, false);
    ok := m.status = 'active' and cur;
    result := jsonb_build_object(
      'valid', ok,
      'current_pass', cur,
      'full_name', m.full_name,
      'photo_path', m.photo_path,
      'member_no', m.member_no,
      'home_branch', home,
      'wing', m.wing,
      'status', m.status,
      'member_since', coalesce(m.approved_at, m.created_at),
      'is_minor', public.is_minor(m.id)
    );
  else
    result := jsonb_build_object(
      'valid', false, 'status', m.status
    );
  end if;

  perform public.write_audit('member.verify_id', 'members', verify_member_id.member_id::text,
    jsonb_build_object('valid', ok, 'current_pass', cur));
  return result;
end;
$$;
revoke execute on function public.verify_member_id(uuid, integer) from public, anon;
grant execute on function public.verify_member_id(uuid, integer) to authenticated;

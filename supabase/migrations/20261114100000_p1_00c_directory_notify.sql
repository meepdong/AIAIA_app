-- P1-00c (part 1): member directory search with privacy and minor masking, and notification
-- delivery fan-out with one batched wake-up of notify-dispatch. Rules: 01-architecture.md 5 and 6.
--
-- members.privacy flags (all optional booleans):
--   show_phone, show_email  contact details; shown to other members only when explicitly true,
--                           and never for a minor (whatever the flag says).
--   show_city, show_occupation, show_photo
--                           directory profile fields; shown unless explicitly false.

-- ---------------------------------------------------------------------------
-- search_directory(q, branch_id, page)
-- ---------------------------------------------------------------------------
create function public.search_directory(q text default null, branch_id uuid default null, page integer default 1)
returns table (
  id uuid,
  full_name text,
  branch_name text,
  city text,
  occupation text,
  photo_path text,
  phone text,
  email text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  term text := nullif(btrim(coalesce(search_directory.q, '')), '');
begin
  -- Waiting room: only active members may search.
  if not public.is_active() then
    raise exception 'directory is for active members only' using errcode = '42501';
  end if;
  if search_directory.page is null or search_directory.page < 1 or search_directory.page > 1000 then
    raise exception 'page must be between 1 and 1000' using errcode = '22023';
  end if;
  if term is not null and length(term) > 100 then
    raise exception 'search text is too long' using errcode = '22023';
  end if;

  return query
  select
    m.id,
    m.full_name,
    b.name,
    case when coalesce(m.privacy ->> 'show_city', 'true') <> 'false' then m.city end,
    case when coalesce(m.privacy ->> 'show_occupation', 'true') <> 'false' then m.occupation end,
    case when coalesce(m.privacy ->> 'show_photo', 'true') <> 'false' then m.photo_path end,
    case when m.privacy ->> 'show_phone' = 'true' and not public.is_minor(m.id) then mp.phone end,
    case when m.privacy ->> 'show_email' = 'true' and not public.is_minor(m.id) then mp.email::text end
  from public.members m
  join public.branches b on b.id = m.branch_id
  left join public.member_private mp on mp.member_id = m.id
  where m.status = 'active'
    and (search_directory.branch_id is null or m.branch_id = search_directory.branch_id)
    and (
      term is null
      or m.full_name operator(extensions.%) term
      or m.full_name ilike '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by
    case when term is null then 0 else extensions.similarity(m.full_name, term) end desc,
    m.full_name,
    m.id
  limit 25
  offset (search_directory.page - 1) * 25;
end;
$$;
revoke execute on function public.search_directory(text, uuid, integer) from public, anon;
grant execute on function public.search_directory(text, uuid, integer) to authenticated;

create index members_full_name_trgm_idx on public.members using gin (full_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Notification delivery: deliveries per channel, then one wake-up call
-- ---------------------------------------------------------------------------
-- Wakes notify-dispatch with one pg_net request. URL and secret header come from app_settings
-- (notify_dispatch_url, notify_dispatch_secret). Missing settings or any error never block the
-- caller: notifications and deliveries stay pending and the pg_cron sweep retries them.
create function public.wake_notify_dispatch()
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select s.value #>> '{}' into fn_url from public.app_settings s where s.key = 'notify_dispatch_url';
  select s.value #>> '{}' into fn_secret from public.app_settings s where s.key = 'notify_dispatch_secret';
  if fn_url is null or nullif(fn_secret, '') is null then
    return;
  end if;
  -- The secret goes out in a header: only over https, or to the local stack.
  if fn_url !~ '^https://' and fn_url !~ '^http://(kong|localhost|127\.0\.0\.1)(:[0-9]+)?(/|$)' then
    raise warning 'notify-dispatch wake-up skipped: url must be https';
    return;
  end if;
  begin
    perform net.http_post(
      url := fn_url,
      body := '{"reason": "wake"}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', fn_secret),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'notify-dispatch wake-up failed: %', sqlerrm;
  end;
end;
$$;
revoke execute on function public.wake_notify_dispatch() from public, anon, authenticated;

-- Statement-level: one pass over all new notifications, then a single wake-up however many rows
-- the statement inserted. A dependent without a login is reached through their guardians with an
-- ACTIVE link; anyone else through their own preferences and devices.
create function public.notifications_fan_out()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  with recipients as (
    select n.id as notification_id, n.member_id as recipient_id
    from new_rows n
    join public.members m on m.id = n.member_id
    where m.user_id is not null
    union
    select n.id, g.guardian_member_id
    from new_rows n
    join public.members m on m.id = n.member_id
    join public.member_guardians g on g.member_id = n.member_id and g.ended_at is null
    join public.members gm on gm.id = g.guardian_member_id and gm.status = 'active'
    where m.user_id is null
  ),
  channels as (
    select r.notification_id, 'push'::text as channel
    from recipients r
    join public.member_private mp on mp.member_id = r.recipient_id
    where coalesce(mp.notify_prefs ->> 'push', 'true') = 'true'
      and exists (select 1 from public.push_tokens t where t.member_id = r.recipient_id and t.platform <> 'web')
    union
    select r.notification_id, 'webpush'
    from recipients r
    join public.member_private mp on mp.member_id = r.recipient_id
    where coalesce(mp.notify_prefs ->> 'push', 'true') = 'true'
      and exists (select 1 from public.push_tokens t where t.member_id = r.recipient_id and t.platform = 'web')
    union
    select r.notification_id, 'email'
    from recipients r
    join public.member_private mp on mp.member_id = r.recipient_id
    where mp.notify_prefs ->> 'email_updates' = 'true'
      and mp.email is not null
      and mp.email_verified_at is not null
  )
  insert into public.notification_deliveries (notification_id, channel)
  select c.notification_id, c.channel from channels c
  on conflict (notification_id, channel) do nothing;

  perform public.wake_notify_dispatch();
  return null;
end;
$$;
revoke execute on function public.notifications_fan_out() from public, anon, authenticated;

create trigger notifications_fan_out
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_fan_out();

-- The same function sweeps for retries every minute.
select cron.schedule('notify-dispatch-sweep', '* * * * *', $$select public.wake_notify_dispatch()$$);

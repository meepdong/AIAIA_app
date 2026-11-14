-- P1-04: admin RPCs the merged contract lacks.
--   admin_set_member_branch  edit a member's branch (members.manage old branch + members.approve new)
--   admin_export_members     keyset-paged CSV export source (data.export), one audit row per page
--   admin_list_settings      app_settings for system.config holders, secret values masked
--   admin_set_setting        edit an existing, non-secret app_settings value (system.config)
-- All are security definer with search_path = '' and check has_permission(); super-admin grants
-- count only with a step-up, through has_permission() itself.

-- ---------------------------------------------------------------------------
-- admin_set_member_branch(member_id, to_branch_id)
-- ---------------------------------------------------------------------------
-- Needs members.manage for the member's current branch and members.approve for the new one
-- (national and global holders satisfy both). Nobody moves their own member row. Mirrors an
-- approved decide_branch_transfer: the branch changes, a branch_change status event is written,
-- the member's branch-scoped roles in the old branch end yesterday (IST) or are withdrawn if they
-- start today or later, any pending transfer request is cancelled, and the member (or, for a
-- dependent, their guardians) is notified. Rejected and deleted members cannot be moved.
create function public.admin_set_member_branch(member_id uuid, to_branch_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  m record;
  a record;
  v_withdrawn boolean;
  n_roles integer := 0;
  n_transfers integer := 0;
begin
  if me is null then
    raise exception 'admin_set_member_branch: sign in required' using errcode = '42501';
  end if;
  if admin_set_member_branch.member_id is null or admin_set_member_branch.to_branch_id is null then
    raise exception 'admin_set_member_branch: member_id and to_branch_id are required' using errcode = '22023';
  end if;

  select mm.id, mm.branch_id, mm.status into m
  from public.members mm where mm.id = admin_set_member_branch.member_id for update;
  if m.id is null then
    raise exception 'admin_set_member_branch: unknown member' using errcode = '22023';
  end if;
  if m.id = me then
    raise exception 'admin_set_member_branch: you cannot change your own branch here' using errcode = '42501';
  end if;
  if not public.has_permission('members.manage', m.branch_id)
     or not public.has_permission('members.approve', admin_set_member_branch.to_branch_id) then
    raise exception 'admin_set_member_branch: members.manage for the current branch and members.approve for the new branch are required'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.branches b where b.id = admin_set_member_branch.to_branch_id) then
    raise exception 'admin_set_member_branch: unknown branch' using errcode = '22023';
  end if;
  if m.branch_id = admin_set_member_branch.to_branch_id then
    raise exception 'admin_set_member_branch: the member is already in that branch' using errcode = '23514';
  end if;
  if m.status not in ('active', 'pending', 'suspended') then
    raise exception 'admin_set_member_branch: a % member cannot be moved', m.status using errcode = '23514';
  end if;

  update public.members mm set branch_id = admin_set_member_branch.to_branch_id where mm.id = m.id;
  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (m.id, m.status, m.status, 'branch_change', me);

  for a in
    select ra.id, ra.role_key, ra.starts_on from public.role_assignments ra
    join public.roles r on r.key = ra.role_key
    where ra.member_id = m.id and r.scope = 'branch' and ra.branch_id = m.branch_id
      and (ra.ends_on is null or ra.ends_on >= today)
    order by ra.id
    for update of ra
  loop
    v_withdrawn := today - 1 < a.starts_on;
    if v_withdrawn then
      delete from public.role_assignments ra where ra.id = a.id;
    else
      update public.role_assignments ra set ends_on = today - 1 where ra.id = a.id;
    end if;
    perform public.write_audit('role.ended', 'role_assignments', a.id::text,
      jsonb_build_object('member_id', m.id, 'role_key', a.role_key, 'branch_id', m.branch_id,
                         'starts_on', a.starts_on, 'ends_on', today - 1, 'withdrawn', v_withdrawn,
                         'reason', 'branch_change'));
    n_roles := n_roles + 1;
  end loop;

  update public.branch_transfers bt
  set status = 'cancelled', decided_by = me, decided_at = now(),
      decision_note = 'Superseded by an officer''s branch change'
  where bt.member_id = m.id and bt.status = 'pending';
  get diagnostics n_transfers = row_count;

  perform public.notify_member_or_guardians(
    m.id, 'membership.branch_changed', 'high',
    'Branch changed', 'An officer moved your membership to a different branch.',
    'Branch changed', 'An officer moved a dependent''s membership to a different branch.',
    jsonb_build_object('member_id', m.id)
  );

  perform public.write_audit('member.branch_changed', 'members', m.id::text,
    jsonb_build_object('from_branch_id', m.branch_id, 'to_branch_id', admin_set_member_branch.to_branch_id,
                       'roles_ended', n_roles, 'transfers_cancelled', n_transfers));

  return jsonb_build_object('member_id', m.id, 'from_branch_id', m.branch_id,
                            'to_branch_id', admin_set_member_branch.to_branch_id,
                            'roles_ended', n_roles, 'transfers_cancelled', n_transfers);
end;
$$;
revoke execute on function public.admin_set_member_branch(uuid, uuid) from public, anon;
grant execute on function public.admin_set_member_branch(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_export_members(branch_id, page_size, after)
-- ---------------------------------------------------------------------------
-- data.export for the branch asked for; branch_id null means every branch and needs a national
-- or global data.export grant (has_permission with a null branch). Keyset-paged on members.id:
-- pass the last member_id of a page as `after` for the next. page_size 1-500 (PostgREST caps a
-- response at 1000). Every page writes one audit row.
-- Exports active, pending and suspended members; rejected and deleted ones are only awaiting purge.
-- Contact fields (phone, email, dob):
--   * only for callers who may read member_private at all, i.e. officers holding members.approve
--     somewhere (01-architecture.md 5.2); otherwise withheld for everyone;
--   * for minors (under 18 or no DOB on record, fail closed) only when the caller's data.export is
--     national or global (brief P1-04: "unless the exporter is a national role").
-- contacts_withheld marks rows whose contact fields were blanked. Emergency contacts are not exported.
create function public.admin_export_members(branch_id uuid default null, page_size integer default 500,
                                            after uuid default null)
returns table (
  member_id uuid,
  member_no text,
  full_name text,
  branch_code text,
  branch_name text,
  wing text,
  status text,
  gender text,
  city text,
  approved_at timestamptz,
  is_minor boolean,
  has_login boolean,
  contacts_withheld boolean,
  phone text,
  email text,
  dob date
)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_size integer := coalesce(admin_export_members.page_size, 500);
  v_contacts boolean;
  v_minor_contacts boolean;
  n integer;
begin
  if not public.has_permission('data.export', admin_export_members.branch_id) then
    raise exception 'admin_export_members: data.export for this scope is required' using errcode = '42501';
  end if;
  if v_size < 1 or v_size > 500 then
    raise exception 'admin_export_members: page_size must be 1-500' using errcode = '22023';
  end if;
  if admin_export_members.branch_id is not null
     and not exists (select 1 from public.branches b where b.id = admin_export_members.branch_id) then
    raise exception 'admin_export_members: unknown branch' using errcode = '22023';
  end if;

  v_contacts := exists (select 1 from public.my_permissions() p where p.permission_key = 'members.approve');
  v_minor_contacts := v_contacts and public.has_permission('data.export');

  return query
  select m.id, m.member_no, m.full_name, b.code, b.name, m.wing, m.status::text, m.gender, m.city, m.approved_at,
         x.minor, m.user_id is not null, w.withheld,
         case when w.withheld then null else mp.phone end,
         case when w.withheld then null else mp.email::text end,
         case when w.withheld then null else mp.dob end
  from public.members m
  join public.branches b on b.id = m.branch_id
  left join public.member_private mp on mp.member_id = m.id
  cross join lateral (
    select (mp.dob is null or mp.dob > (today - interval '18 years')::date) as minor
  ) x
  cross join lateral (
    select (not v_contacts or (x.minor and not v_minor_contacts)) as withheld
  ) w
  where m.status in ('active', 'pending', 'suspended')
    and (admin_export_members.branch_id is null or m.branch_id = admin_export_members.branch_id)
    and (admin_export_members.after is null or m.id > admin_export_members.after)
  order by m.id
  limit v_size;
  get diagnostics n = row_count;

  perform public.write_audit('members.exported', 'members', null,
    jsonb_build_object('branch_id', admin_export_members.branch_id, 'page_size', v_size,
                       'after', admin_export_members.after, 'rows', n,
                       'contacts', v_contacts, 'minor_contacts', v_minor_contacts));
end;
$$;
revoke execute on function public.admin_export_members(uuid, integer, uuid) from public, anon;
grant execute on function public.admin_export_members(uuid, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
-- A secret setting is any key containing secret, token, password or key. Its value is never
-- returned to a client and it cannot be changed here (only by the service role / ops).
create function public.admin_setting_is_secret(key text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select admin_setting_is_secret.key ~ '(secret|token|password|key)';
$$;
revoke execute on function public.admin_setting_is_secret(text) from public, anon, authenticated;

-- Readable but not editable here: the URL notify-dispatch is woken at carries the dispatch secret
-- in a header (wake_notify_dispatch), so changing it could send that secret elsewhere.
create function public.admin_setting_is_locked(key text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select admin_setting_is_locked.key = any (array['notify_dispatch_url']);
$$;
revoke execute on function public.admin_setting_is_locked(text) from public, anon, authenticated;

-- admin_list_settings(): every app_settings row for system.config holders; secret values are null.
create function public.admin_list_settings()
returns table (
  key text,
  value jsonb,
  is_public boolean,
  description text,
  updated_at timestamptz,
  updated_by uuid,
  is_secret boolean,
  editable boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_permission('system.config') then
    raise exception 'admin_list_settings: system.config is required' using errcode = '42501';
  end if;
  return query
  select s.key,
         case when public.admin_setting_is_secret(s.key) then null else s.value end,
         s.is_public, s.description, s.updated_at, s.updated_by,
         public.admin_setting_is_secret(s.key),
         not (public.admin_setting_is_secret(s.key) or public.admin_setting_is_locked(s.key))
  from public.app_settings s
  order by s.key;
end;
$$;
revoke execute on function public.admin_list_settings() from public, anon;
grant execute on function public.admin_list_settings() to authenticated;

-- admin_set_setting(key, value): system.config; an existing, non-secret, unlocked key only. The new
-- value keeps the JSON type of the old one (null may become, or replace, any type) and is at most
-- 10000 characters. Table checks (e.g. step_up_roles keeps super_admin) still apply. Values are not
-- copied into the audit log, as with the app_settings_audit trigger.
create function public.admin_set_setting(key text, value jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  cur record;
  v_updated timestamptz;
begin
  if not public.has_permission('system.config') then
    raise exception 'admin_set_setting: system.config is required' using errcode = '42501';
  end if;
  if admin_set_setting.key is null then
    raise exception 'admin_set_setting: key is required' using errcode = '22023';
  end if;
  if public.admin_setting_is_secret(admin_set_setting.key) then
    raise exception 'admin_set_setting: secret settings cannot be changed here' using errcode = '42501';
  end if;
  if public.admin_setting_is_locked(admin_set_setting.key) then
    raise exception 'admin_set_setting: this setting cannot be changed here' using errcode = '42501';
  end if;

  select s.key, s.value, s.is_public into cur
  from public.app_settings s where s.key = admin_set_setting.key for update;
  if cur.key is null then
    raise exception 'admin_set_setting: unknown setting' using errcode = '22023';
  end if;
  if admin_set_setting.value is null then
    raise exception 'admin_set_setting: value is required (use JSON null to clear)' using errcode = '22023';
  end if;
  if length(admin_set_setting.value::text) > 10000 then
    raise exception 'admin_set_setting: value is limited to 10000 characters' using errcode = '22023';
  end if;
  if jsonb_typeof(admin_set_setting.value) <> jsonb_typeof(cur.value)
     and 'null' not in (jsonb_typeof(admin_set_setting.value), jsonb_typeof(cur.value)) then
    raise exception 'admin_set_setting: % expects a JSON %', cur.key, jsonb_typeof(cur.value) using errcode = '22023';
  end if;

  update public.app_settings s set value = admin_set_setting.value, updated_by = me
  where s.key = cur.key
  returning s.updated_at into v_updated;

  perform public.write_audit('settings.updated', 'app_settings', cur.key,
    jsonb_build_object('is_public', cur.is_public));

  return jsonb_build_object('key', cur.key, 'updated_at', v_updated);
end;
$$;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

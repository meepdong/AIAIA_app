-- P1-04: admin RPCs the merged contract lacks.
--   admin_set_member_branch  edit a member's branch (members.manage old branch + members.approve new)
--   admin_export_members     keyset-paged CSV export source (data.export), one audit row per page
--   admin_list_settings      app_settings for system.config holders, secret values masked
--   admin_set_setting        edit an allowlisted app_settings value, checked per key (system.config)
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
-- The caller must hold members.manage somewhere before the member is even looked up, so an
-- unauthorised caller cannot tell a real member id from an unknown one. Ending the member's
-- old-branch roles needs roles.assign for that branch, as end_role would; without it the call is
-- refused and those roles must be ended first.
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
  if not exists (select 1 from public.my_permissions() p where p.permission_key = 'members.manage') then
    raise exception 'admin_set_member_branch: members.manage for the current branch and members.approve for the new branch are required'
      using errcode = '42501';
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
  if not public.has_permission('roles.assign', m.branch_id) and exists (
    select 1 from public.role_assignments ra
    join public.roles r on r.key = ra.role_key
    where ra.member_id = m.id and r.scope = 'branch' and ra.branch_id = m.branch_id
      and (ra.ends_on is null or ra.ends_on >= today)
  ) then
    raise exception 'admin_set_member_branch: the member holds roles in their current branch; end their branch roles first'
      using errcode = '42501';
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
-- returned to a client (only the service role / ops see or change it).
create function public.admin_setting_is_secret(key text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select admin_setting_is_secret.key ~ '(secret|token|password|key)';
$$;
revoke execute on function public.admin_setting_is_secret(text) from public, anon, authenticated;

-- The allowlist: the only keys admin_set_setting may change. Every other key (secrets, any key
-- added later) is read-only here until a migration adds it together with a value rule in
-- admin_setting_value_error. Never list a secret-named key.
--   adult_handover_grace_days  integer 0-365. is_guardian_of adds it to a date in every guardian
--                              RLS check: huge values overflow, large ones keep guardians on adults.
--   email_daily_cap            integer 1-10000. Daily sends through the primary provider
--                              (Workspace allows about 2000).
--   grievance_officer          object. Public grievance contact: title (text, required), name,
--                              email, phone (text or null), placeholder (boolean); nothing else.
--   legal_approved             boolean. Hides the DRAFT banner on the public legal pages.
--   min_app_version            text 'x.y.z' (each part 0-9999). Oldest app version allowed to run.
--   retention_months           integer 1-120. Purge cut-off for rejected and deleted accounts;
--                              0 or null would purge at once or break the purge.
--   step_up_roles              array of existing role keys, no repeats. The table checks still
--                              apply (an array that keeps super_admin, never public).
--   trusted_device_days        null or integer 1-3650. Null: trusted devices never expire (the
--                              owner's default).
-- Left off: notify_dispatch_url. The notify-dispatch wake-up sends the dispatch secret in a header
-- to that URL (wake_notify_dispatch), so changing it could send the secret elsewhere.
-- notify_dispatch_secret is a secret.
create function public.admin_setting_is_editable(key text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select admin_setting_is_editable.key = any (array[
    'adult_handover_grace_days', 'email_daily_cap', 'grievance_officer', 'legal_approved',
    'min_app_version', 'retention_months', 'step_up_roles', 'trusted_device_days'
  ]);
$$;
revoke execute on function public.admin_setting_is_editable(text) from public, anon, authenticated;

-- The value rule of each allowlisted key: null when v is acceptable for k, else what is wrong.
-- A key without a rule is refused. Each test is its own statement, so no check runs on a value
-- of the wrong JSON type.
create function public.admin_setting_value_error(k text, v jsonb)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  t text := jsonb_typeof(v);
  n numeric;  -- v as a whole number, or null
begin
  -- Whole numbers only, written as plain integer text: '30.0' or '1e1' would break later
  -- readers that cast with (value #>> '{}')::int.
  if t = 'number' and v::text ~ '^-?[0-9]{1,9}$' then
    n := v::text::numeric;
  end if;

  case k
  when 'adult_handover_grace_days' then
    if n is null or n < 0 or n > 365 then
      return 'expects a whole number from 0 to 365';
    end if;
  when 'email_daily_cap' then
    if n is null or n < 1 or n > 10000 then
      return 'expects a whole number from 1 to 10000';
    end if;
  when 'retention_months' then
    if n is null or n < 1 or n > 120 then
      return 'expects a whole number from 1 to 120';
    end if;
  when 'trusted_device_days' then
    if t <> 'null' and (n is null or n < 1 or n > 3650) then
      return 'expects null or a whole number from 1 to 3650';
    end if;
  when 'legal_approved' then
    if t <> 'boolean' then
      return 'expects true or false';
    end if;
  when 'min_app_version' then
    if t <> 'string' then
      return 'expects a version like 1.2.3';
    end if;
    if (v #>> '{}') !~ '^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$' then
      return 'expects a version like 1.2.3';
    end if;
  when 'step_up_roles' then
    if t <> 'array' then
      return 'expects a list of role keys';
    end if;
    if exists (select 1 from jsonb_array_elements(v) as e(x) where jsonb_typeof(e.x) <> 'string') then
      return 'expects a list of role keys';
    end if;
    if exists (select 1 from jsonb_array_elements_text(v) as e(x)
               where not exists (select 1 from public.roles r where r.key = e.x)) then
      return 'lists a role that does not exist';
    end if;
    if (select count(distinct e.x) from jsonb_array_elements_text(v) as e(x)) <> jsonb_array_length(v) then
      return 'lists a role twice';
    end if;
  when 'grievance_officer' then
    if t <> 'object' then
      return 'expects a contact object';
    end if;
    if exists (select 1 from jsonb_object_keys(v) as o(x)
               where o.x not in ('title', 'name', 'email', 'phone', 'placeholder')) then
      return 'takes only title, name, email, phone and placeholder';
    end if;
    if jsonb_typeof(v -> 'title') is distinct from 'string' then
      return 'needs a title of 1 to 200 characters';
    end if;
    if length(v ->> 'title') not between 1 and 200 then
      return 'needs a title of 1 to 200 characters';
    end if;
    if exists (select 1 from jsonb_each(v) as f(fk, fv)
               where f.fk in ('name', 'email', 'phone') and jsonb_typeof(f.fv) not in ('null', 'string')) then
      return 'expects name, email and phone as text or null';
    end if;
    if exists (select 1 from jsonb_each_text(v) as f(fk, fv)
               where f.fk in ('name', 'email', 'phone') and length(f.fv) > 200) then
      return 'expects name, email and phone of at most 200 characters';
    end if;
    if v ? 'placeholder' and jsonb_typeof(v -> 'placeholder') <> 'boolean' then
      return 'expects placeholder as true or false';
    end if;
  else
    return 'has no value rule';
  end case;
  return null;
end;
$$;
revoke execute on function public.admin_setting_value_error(text, jsonb) from public, anon, authenticated;

-- admin_list_settings(): every app_settings row for system.config holders; secret values are null;
-- editable is the allowlist above. updated_by is left out, as the column grants withhold it.
create function public.admin_list_settings()
returns table (
  key text,
  value jsonb,
  is_public boolean,
  description text,
  updated_at timestamptz,
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
         s.is_public, s.description, s.updated_at,
         public.admin_setting_is_secret(s.key),
         public.admin_setting_is_editable(s.key)
  from public.app_settings s
  order by s.key;
end;
$$;
revoke execute on function public.admin_list_settings() from public, anon;
grant execute on function public.admin_list_settings() to authenticated;

-- admin_set_setting(key, value): system.config; an existing, allowlisted key only (42501
-- otherwise). The value is at most 10000 characters and must pass the key's value rule (22023).
-- Table checks (e.g. step_up_roles keeps super_admin) still apply. Values are not copied into the
-- audit log, as with the app_settings_audit trigger.
create function public.admin_set_setting(key text, value jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  cur record;
  v_error text;
  v_updated timestamptz;
begin
  if not public.has_permission('system.config') then
    raise exception 'admin_set_setting: system.config is required' using errcode = '42501';
  end if;
  if admin_set_setting.key is null then
    raise exception 'admin_set_setting: key is required' using errcode = '22023';
  end if;

  select s.key, s.value, s.is_public into cur
  from public.app_settings s where s.key = admin_set_setting.key for update;
  if cur.key is null then
    raise exception 'admin_set_setting: unknown setting' using errcode = '22023';
  end if;
  if not public.admin_setting_is_editable(cur.key) then
    raise exception 'admin_set_setting: this setting cannot be changed here' using errcode = '42501';
  end if;
  if admin_set_setting.value is null then
    raise exception 'admin_set_setting: value is required (use JSON null to clear)' using errcode = '22023';
  end if;
  if length(admin_set_setting.value::text) > 10000 then
    raise exception 'admin_set_setting: value is limited to 10000 characters' using errcode = '22023';
  end if;
  v_error := public.admin_setting_value_error(cur.key, admin_set_setting.value);
  if v_error is not null then
    raise exception 'admin_set_setting: % %', cur.key, v_error using errcode = '22023';
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

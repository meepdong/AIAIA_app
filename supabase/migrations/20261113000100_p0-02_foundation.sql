-- P0-02 DB foundation: enums, core tables, RLS baseline, permission helpers and the audit log.
-- Rules: docs/build/01-architecture.md sections 5 and 6. Every table has RLS, deny by default.
-- Writes by clients are limited to the whitelisted self-service columns below; every other
-- write goes through security definer RPCs added by later briefs (P1-00a/b/c, P1-04).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- pg_net's net.* functions are owned by supabase_admin and carry its grants to anon and
-- authenticated; the postgres role cannot revoke them from a migration. They stay unreachable
-- because the net schema is not in the API's exposed schemas (config.toml [api] schemas).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_status as enum ('pending', 'active', 'rejected', 'suspended', 'deleted');
create type public.role_scope as enum ('global', 'national', 'branch');
create type public.consent_method as enum ('paper_form', 'phone_call', 'guardian_account', 'in_person', 'self_adult');
create type public.audience as enum ('youth', 'aiaia', 'all');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,16}$'),
  name text not null unique check (length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

-- Non-sensitive member fields only. Phone, DOB, email and emergency contacts live in member_private.
create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  branch_id uuid not null references public.branches (id),
  gender text,
  photo_path text,
  city text,
  occupation text,
  education text,
  bio text check (bio is null or length(bio) <= 2000),
  wing text not null default 'youth' check (wing in ('youth', 'aiaia')),
  status public.member_status not null default 'pending',
  status_reason text,
  status_changed_at timestamptz not null default now(),
  approved_by uuid references public.members (id),
  approved_at timestamptz,
  pass_version integer not null default 1 check (pass_version >= 1),
  privacy jsonb not null default '{}'::jsonb check (jsonb_typeof(privacy) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  member_no text unique,
  adult_consent_required boolean not null default false,
  adult_consent_at timestamptz,
  -- Self-editable, so pinned to the member's own folder in storage.
  constraint members_photo_path_own_folder
    check (photo_path is null or (photo_path like 'members/' || id::text || '/%' and position('..' in photo_path) = 0 and position(chr(92) in photo_path) = 0))
);
create index members_branch_id_idx on public.members (branch_id);
create index members_status_idx on public.members (status);

-- Sensitive fields, one row per member. Other members never read this table directly.
create table public.member_private (
  member_id uuid primary key references public.members (id) on delete cascade,
  phone text unique check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  dob date not null,
  email extensions.citext,
  email_verified_at timestamptz,
  emergency_contact_name text,
  emergency_contact_phone text check (emergency_contact_phone is null or emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  notify_prefs jsonb not null
    default '{"push": true, "email_updates": false, "email_receipts": false, "whatsapp": true}'::jsonb
    check (jsonb_typeof(notify_prefs) = 'object')
);

create table public.member_guardians (
  member_id uuid not null references public.members (id) on delete cascade,
  guardian_member_id uuid not null references public.members (id) on delete cascade,
  relationship text not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('turned_18', 'claimed', 'removed')),
  primary key (member_id, guardian_member_id),
  check (member_id <> guardian_member_id),
  check ((ended_at is null) = (ended_reason is null))
);
create index member_guardians_guardian_active_idx
  on public.member_guardians (guardian_member_id) where ended_at is null;

create table public.roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  scope public.role_scope not null,
  description text
);

create table public.permissions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text
);

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);
create index role_permissions_permission_key_idx on public.role_permissions (permission_key);

-- Term dates are inclusive and evaluated in Asia/Kolkata.
create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  role_key text not null references public.roles (key),
  branch_id uuid references public.branches (id),
  starts_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  ends_on date,
  assigned_by uuid references public.members (id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index role_assignments_member_id_idx on public.role_assignments (member_id);

create table public.member_status_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  from_status public.member_status,
  to_status public.member_status not null,
  reason text,
  changed_by uuid references public.members (id),
  created_at timestamptz not null default now()
);
create index member_status_events_member_id_idx on public.member_status_events (member_id);

-- Insert-only. No foreign keys, so purging or anonymising a member never has to touch it.
create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_member_id uuid,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at);

-- ---------------------------------------------------------------------------
-- RLS on, deny by default (policies follow the helper functions)
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.members enable row level security;
alter table public.member_private enable row level security;
alter table public.member_guardians enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignments enable row level security;
alter table public.member_status_events enable row level security;
alter table public.audit_log enable row level security;

-- TRUNCATE ignores RLS, so clients never get it. audit_log takes no client writes at all.
revoke truncate on
  public.branches, public.members, public.member_private, public.member_guardians, public.roles,
  public.permissions, public.role_permissions, public.role_assignments, public.member_status_events,
  public.audit_log
from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- The member row of the signed-in user, whatever its status.
create function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id from public.members m where m.user_id = (select auth.uid());
$$;

-- True only for a signed-in user whose member row is active (the waiting-room gate).
create function public.is_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

-- Roles whose permissions count only while the session holds a step-up (01-architecture.md 5.6).
-- P1-00a replaces the body to read app_settings.step_up_roles (default ['super_admin']).
create function public.step_up_roles()
returns text[]
language sql stable
set search_path = ''
as $$
  select array['super_admin']::text[];
$$;

-- P1-00a replaces this with a lookup of admin_step_ups for auth.jwt()->>'session_id'.
-- Until then no session holds a step-up, so step-up-role permissions are unusable in Phase 0.
create function public.has_step_up()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select false;
$$;

-- The one permission check. `branch` null means "not branch-specific": only global and
-- national assignments satisfy it. A branch-scoped assignment counts only for its own branch.
-- Callers that need "anywhere" use my_permissions().
create function public.has_permission(perm text, branch uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    join public.role_assignments ra on ra.member_id = m.id
    join public.roles r on r.key = ra.role_key
    join public.role_permissions rp on rp.role_key = ra.role_key
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission_key = perm
      and ra.starts_on <= (now() at time zone 'Asia/Kolkata')::date
      and (ra.ends_on is null or ra.ends_on >= (now() at time zone 'Asia/Kolkata')::date)
      and (r.scope in ('global', 'national') or (r.scope = 'branch' and ra.branch_id = branch))
      and (not (ra.role_key = any (public.step_up_roles())) or public.has_step_up())
  );
$$;

-- The caller's effective permissions. branch_id is null for global and national grants.
create function public.my_permissions()
returns table (permission_key text, branch_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select distinct rp.permission_key, case when r.scope = 'branch' then ra.branch_id end
  from public.members m
  join public.role_assignments ra on ra.member_id = m.id
  join public.roles r on r.key = ra.role_key
  join public.role_permissions rp on rp.role_key = ra.role_key
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and ra.starts_on <= (now() at time zone 'Asia/Kolkata')::date
    and (ra.ends_on is null or ra.ends_on >= (now() at time zone 'Asia/Kolkata')::date)
    and (not (ra.role_key = any (public.step_up_roles())) or public.has_step_up());
$$;

-- Under 18 today (Asia/Kolkata). A member with no DOB on record counts as a minor (fail closed).
create function public.is_minor(member_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select mp.dob > ((now() at time zone 'Asia/Kolkata')::date - interval '18 years')::date
     from public.member_private mp
     where mp.member_id = is_minor.member_id),
    true
  );
$$;

-- The only guardian path: an active caller with an ACTIVE link (ended_at is null) to the ward.
create function public.is_guardian_of(ward uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active() and exists (
    select 1 from public.member_guardians g
    where g.member_id = ward
      and g.guardian_member_id = public.current_member_id()
      and g.ended_at is null
  );
$$;

revoke execute on function
  public.current_member_id(), public.is_active(), public.step_up_roles(), public.has_step_up(),
  public.has_permission(text, uuid), public.my_permissions(), public.is_minor(uuid),
  public.is_guardian_of(uuid)
from public, anon;
grant execute on function
  public.current_member_id(), public.is_active(), public.step_up_roles(), public.has_step_up(),
  public.has_permission(text, uuid), public.my_permissions(), public.is_guardian_of(uuid)
to authenticated;
-- is_minor is not used by any client-facing policy; security definer RPCs call it as owner.
revoke execute on function public.is_minor(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create function public.write_audit(action text, entity text, entity_id text default null, details jsonb default '{}'::jsonb)
returns bigint
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  if write_audit.action is null or btrim(write_audit.action) = '' or length(write_audit.action) > 100 then
    raise exception 'write_audit: action must be 1-100 characters' using errcode = '22023';
  end if;
  if write_audit.entity is null or btrim(write_audit.entity) = '' or length(write_audit.entity) > 100 then
    raise exception 'write_audit: entity must be 1-100 characters' using errcode = '22023';
  end if;
  if write_audit.entity_id is not null and length(write_audit.entity_id) > 200 then
    raise exception 'write_audit: entity_id is too long' using errcode = '22023';
  end if;
  if write_audit.details is not null and jsonb_typeof(write_audit.details) <> 'object' then
    raise exception 'write_audit: details must be a JSON object' using errcode = '22023';
  end if;

  insert into public.audit_log (actor_member_id, actor_user_id, action, entity, entity_id, details)
  values (
    public.current_member_id(),
    (select auth.uid()),
    write_audit.action,
    write_audit.entity,
    write_audit.entity_id,
    coalesce(write_audit.details, '{}'::jsonb)
  )
  returning id into new_id;
  return new_id;
end;
$$;
-- Callable only from other security definer functions (which run as the owner).
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;

create function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is insert-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();

-- ---------------------------------------------------------------------------
-- Column whitelists for direct client updates
-- ---------------------------------------------------------------------------
-- Rejects a client (anon/authenticated) UPDATE that changes any column not named in the trigger
-- arguments. Security definer RPCs run as their owner, so privileged changes still go through them.
-- New columns are protected by default.
create function public.enforce_update_whitelist()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed text[];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  select coalesce(array_agg(n.key order by n.key), '{}'::text[])
    into changed
  from jsonb_each(to_jsonb(new)) n
  where not (n.key = any (tg_argv))
    and n.value is distinct from (to_jsonb(old) -> n.key);
  if cardinality(changed) > 0 then
    raise exception 'cannot change %.% column(s) % directly', tg_table_schema, tg_table_name, changed
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- status, status_*, approved_*, user_id, wing, pass_version, branch_id, member_no and the
-- adult-consent fields change only through RPCs.
create trigger members_update_whitelist
  before update on public.members
  for each row execute function public.enforce_update_whitelist(
    'full_name', 'gender', 'photo_path', 'city', 'occupation', 'education', 'bio', 'privacy', 'updated_at'
  );
create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- phone (support flow), dob (minor status), email and email_verified_at (verification flow)
-- change only through RPCs.
create trigger member_private_update_whitelist
  before update on public.member_private
  for each row execute function public.enforce_update_whitelist(
    'emergency_contact_name', 'emergency_contact_phone', 'notify_prefs'
  );

-- A branch-scoped role needs a branch; global and national roles must not have one.
create function public.check_role_assignment_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s public.role_scope;
begin
  select r.scope into s from public.roles r where r.key = new.role_key;
  if s = 'branch' and new.branch_id is null then
    raise exception 'role % is branch-scoped and needs a branch_id', new.role_key using errcode = '23514';
  elsif s <> 'branch' and new.branch_id is not null then
    raise exception 'role % is % scoped and takes no branch_id', new.role_key, s using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger role_assignments_check_scope
  before insert or update on public.role_assignments
  for each row execute function public.check_role_assignment_scope();

-- Branch writes are audited (01-architecture.md 5.5). write_audit records auth.uid() as the actor.
create function public.audit_branch_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.branches := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.write_audit(
    'branches.' || lower(tg_op), 'branches', b.id::text,
    jsonb_build_object('code', b.code, 'name', b.name)
  );
  return null;
end;
$$;

create trigger branches_audit
  after insert or update or delete on public.branches
  for each row execute function public.audit_branch_change();

revoke execute on function
  public.audit_log_block_changes(), public.enforce_update_whitelist(), public.set_updated_at(),
  public.check_role_assignment_scope(), public.audit_branch_change()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies (all `to authenticated`; anon gets nothing)
-- ---------------------------------------------------------------------------

-- branches: everyone signed in (pending applicants need the list); writes need system.config.
create policy branches_select on public.branches
  for select to authenticated using (true);
create policy branches_insert on public.branches
  for insert to authenticated with check ((select public.has_permission('system.config')));
create policy branches_update on public.branches
  for update to authenticated
  using ((select public.has_permission('system.config')))
  with check ((select public.has_permission('system.config')));
create policy branches_delete on public.branches
  for delete to authenticated using ((select public.has_permission('system.config')));

-- members
create policy members_select_own on public.members
  for select to authenticated using (user_id = (select auth.uid()));
create policy members_select_active on public.members
  for select to authenticated using ((select public.is_active()) and status = 'active');
create policy members_select_approver on public.members
  for select to authenticated using (public.has_permission('members.approve', branch_id));
create policy members_update_own on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- member_private: self, guardians with an active link, and read-only for every officer who holds
-- members.approve anywhere (branch or national), in any branch, minors included. Owner ruling
-- 2026-11-13. my_permissions() applies status, term dates and step-up exactly as has_permission.
create policy member_private_select_self on public.member_private
  for select to authenticated using (member_id = (select public.current_member_id()));
create policy member_private_select_guardian on public.member_private
  for select to authenticated using (public.is_guardian_of(member_id));
create policy member_private_select_approver on public.member_private
  for select to authenticated using (
    exists (
      select 1 from public.my_permissions() p where p.permission_key = 'members.approve'
    )
  );
create policy member_private_update_self on public.member_private
  for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));
create policy member_private_update_guardian on public.member_private
  for update to authenticated
  using (public.is_guardian_of(member_id))
  with check (public.is_guardian_of(member_id));

-- member_guardians: the ward sees their own link history; the guardian sees only active links, and
-- only while they are themselves active. Writes go through RPCs.
create policy member_guardians_select_party on public.member_guardians
  for select to authenticated using (
    member_id = (select public.current_member_id())
    or (
      guardian_member_id = (select public.current_member_id())
      and ended_at is null
      and (select public.is_active())
    )
  );

-- roles / permissions / role_permissions: active users only.
create policy roles_select_active on public.roles
  for select to authenticated using ((select public.is_active()));
create policy permissions_select_active on public.permissions
  for select to authenticated using ((select public.is_active()));
create policy role_permissions_select_active on public.role_permissions
  for select to authenticated using ((select public.is_active()));

-- role_assignments: own, plus all for roles.assign. Writes only via the P1-04 RPC.
create policy role_assignments_select on public.role_assignments
  for select to authenticated using (
    member_id = (select public.current_member_id())
    or (select public.has_permission('roles.assign'))
  );

-- member_status_events: own history, plus members.manage for the member's branch.
create policy member_status_events_select on public.member_status_events
  for select to authenticated using (
    member_id = (select public.current_member_id())
    or exists (
      select 1 from public.members m
      where m.id = member_status_events.member_id
        and public.has_permission('members.manage', m.branch_id)
    )
  );

-- audit_log: read needs audit.view; no write policies (writes go through write_audit).
create policy audit_log_select on public.audit_log
  for select to authenticated using ((select public.has_permission('audit.view')));

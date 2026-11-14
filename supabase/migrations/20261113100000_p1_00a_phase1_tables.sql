-- P1-00a Phase-1 tables + RLS. Rules: docs/build/01-architecture.md sections 5 and 6.
-- Every table has RLS, deny by default. Anon gets nothing except the public app settings.
-- Writes that the brief routes "through RPCs only" have their table privileges revoked from
-- clients, so they fail even if a permissive policy is ever added by mistake. The RPCs themselves
-- come in P1-00b / P1-00c and later briefs.

-- ---------------------------------------------------------------------------
-- app_settings, and the step-up helpers that read it
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  value jsonb not null,
  -- Public rows (e.g. the grievance contact) are readable by anyone, signed in or not.
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id),
  constraint app_settings_step_up_roles_is_array
    check (key <> 'step_up_roles' or jsonb_typeof(value) = 'array'),
  -- super_admin can never be dropped from the list, so the list cannot be emptied to disable step-ups.
  constraint app_settings_step_up_roles_keeps_super_admin
    check (key <> 'step_up_roles' or (jsonb_typeof(value) = 'array' and value ? 'super_admin')),
  constraint app_settings_step_up_roles_private
    check (key <> 'step_up_roles' or not is_public)
);

-- Roles whose permissions count only while the session holds a step-up (01-architecture.md 5.6).
-- Reads app_settings.step_up_roles. A missing row falls back to ['super_admin'] (fail closed).
create or replace function public.step_up_roles()
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(s.value))
     from public.app_settings s
     where s.key = 'step_up_roles'),
    array['super_admin']::text[]
  );
$$;

-- Trusted super-admin devices: only the SHA-256 hash (hex) of the device secret is stored.
create table public.admin_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  label text check (label is null or length(label) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index admin_trusted_devices_member_id_idx on public.admin_trusted_devices (member_id);

-- Admin step-ups: one row per login session (auth.jwt()->>'session_id'). expires_at NULL means
-- valid for the life of the session. Service role only.
create table public.admin_step_ups (
  session_id uuid primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz,
  source text not null check (source in ('email_otp', 'trusted_device')),
  -- Set when the step-up came from a trusted device: revoking the device ends the step-up.
  trusted_device_id uuid references public.admin_trusted_devices (id) on delete cascade
);
create index admin_step_ups_member_id_idx on public.admin_step_ups (member_id);
create index admin_step_ups_trusted_device_id_idx on public.admin_step_ups (trusted_device_id);

-- True when the caller's current session holds a live step-up issued to the caller.
-- A session_id claim that is missing or not a uuid yields false, never an error.
create or replace function public.has_step_up()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_step_ups s
    where s.session_id = (
        select case
          when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (auth.jwt() ->> 'session_id')::uuid
        end
      )
      and s.member_id = public.current_member_id()
      and (s.expires_at is null or s.expires_at > now())
      -- Dies with the login session ...
      and exists (select 1 from auth.sessions a where a.id = s.session_id)
      -- ... and, when issued from a trusted device, with that device.
      and (
        s.trusted_device_id is null
        or exists (
          select 1 from public.admin_trusted_devices d
          where d.id = s.trusted_device_id and d.revoked_at is null
            and (d.expires_at is null or d.expires_at > now())
        )
      )
  );
$$;


create table public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  email extensions.citext not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);
create index email_verifications_member_id_idx on public.email_verifications (member_id);

-- Per-number OTP send log for the Send SMS hook (P1-01). Written only by the service role.
create table public.otp_throttle (
  phone_hash text not null check (length(phone_hash) between 16 and 128),
  sent_at timestamptz not null default now()
);
comment on column public.otp_throttle.phone_hash is
  'Must be an HMAC-SHA256 of the phone number keyed with a function secret, never a bare hash: phone numbers are low-entropy and a bare hash can be reversed by enumeration.';
create index otp_throttle_phone_hash_sent_at_idx on public.otp_throttle (phone_hash, sent_at);

-- ---------------------------------------------------------------------------
-- Membership lifecycle
-- ---------------------------------------------------------------------------
create sequence public.member_no_seq as bigint start with 1 increment by 1 no cycle;

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  guardian_name text check (guardian_name is null or length(btrim(guardian_name)) between 1 and 120),
  guardian_phone text check (guardian_phone is null or guardian_phone ~ '^\+[1-9][0-9]{7,14}$'),
  guardian_alerts boolean not null default false,
  method public.consent_method not null,
  document_path text check (
    document_path is null
    or (length(document_path) <= 300 and position('..' in document_path) = 0 and position(chr(92) in document_path) = 0)
  ),
  attested_by uuid references public.members (id),
  attested_at timestamptz not null default now()
);
create index consent_records_member_id_idx on public.consent_records (member_id);

create table public.dependent_claims (
  id uuid primary key default gen_random_uuid(),
  dependent_id uuid not null references public.members (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index dependent_claims_dependent_id_idx on public.dependent_claims (dependent_id);

-- Paper-roster rows awaiting a member (P1-08 / import_roster in P1-00c). Holds phone and DOB,
-- so no client access until a brief adds a scoped policy or RPC.
create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  dob date,
  member_no text,
  notes text check (notes is null or length(notes) <= 1000),
  imported_by uuid references public.members (id),
  imported_at timestamptz not null default now(),
  claimed_member_id uuid references public.members (id),
  claimed_at timestamptz
);
create unique index roster_entries_phone_key on public.roster_entries (phone) where phone is not null;
create index roster_entries_branch_id_idx on public.roster_entries (branch_id);

create table public.branch_transfers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  from_branch_id uuid not null references public.branches (id),
  to_branch_id uuid not null references public.branches (id),
  reason text check (reason is null or length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid references public.members (id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.members (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  check (from_branch_id <> to_branch_id),
  check ((status = 'pending') = (decided_at is null))
);
create index branch_transfers_member_id_idx on public.branch_transfers (member_id);
create unique index branch_transfers_one_pending_idx on public.branch_transfers (member_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Notifications and push
-- ---------------------------------------------------------------------------
-- Web tokens store the Web Push subscription JSON; native tokens store the Expo push token.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null default public.current_member_id() references public.members (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'web')),
  token text check (token is null or length(token) between 1 and 512),
  subscription jsonb check (subscription is null or jsonb_typeof(subscription) = 'object'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (
    (platform = 'web' and subscription is not null and token is null)
    or (platform <> 'web' and token is not null and subscription is null)
  )
);
create unique index push_tokens_token_key on public.push_tokens (token) where token is not null;
create unique index push_tokens_web_endpoint_key on public.push_tokens ((subscription ->> 'endpoint')) where subscription is not null;
create index push_tokens_member_id_idx on public.push_tokens (member_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{0,62}$'),
  priority text not null default 'normal' check (priority in ('high', 'normal')),
  title text not null check (length(title) between 1 and 200),
  body text check (body is null or length(body) <= 2000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_member_id_created_at_idx on public.notifications (member_id, created_at desc);

create table public.notification_deliveries (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('push', 'webpush', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (notification_id, channel)
);
create index notification_deliveries_pending_idx on public.notification_deliveries (status) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Content: announcements and events
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('national', 'branch')),
  branch_id uuid references public.branches (id),
  audience public.audience not null default 'youth',
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(body) <= 10000),
  image_path text check (
    image_path is null
    or (length(image_path) <= 300 and position('..' in image_path) = 0 and position(chr(92) in image_path) = 0)
  ),
  pinned boolean not null default false,
  -- NULL is a draft; a future time is scheduled.
  published_at timestamptz,
  hidden_at timestamptz,
  author_member_id uuid not null default public.current_member_id() references public.members (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_scope_branch check ((scope = 'branch') = (branch_id is not null))
);
create index announcements_published_at_idx on public.announcements (published_at desc);
create index announcements_branch_id_idx on public.announcements (branch_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('national', 'branch')),
  branch_id uuid references public.branches (id),
  audience public.audience not null default 'youth',
  title text not null check (length(btrim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 10000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_name text check (venue_name is null or length(venue_name) <= 200),
  venue_address text check (venue_address is null or length(venue_address) <= 500),
  map_url text check (map_url is null or (map_url ~ '^https://' and length(map_url) <= 1000)),
  cover_path text check (
    cover_path is null
    or (length(cover_path) <= 300 and position('..' in cover_path) = 0 and position(chr(92) in cover_path) = 0)
  ),
  capacity integer check (capacity is null or capacity > 0),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  -- Members see published and cancelled events (so they learn of a cancellation), never drafts.
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  hidden_at timestamptz,
  created_by uuid not null default public.current_member_id() references public.members (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_scope_branch check ((scope = 'branch') = (branch_id is not null)),
  constraint events_ends_after_starts check (ends_at >= starts_at),
  constraint events_registration_window check (
    registration_opens_at is null or registration_closes_at is null or registration_closes_at >= registration_opens_at
  )
);
create index events_starts_at_idx on public.events (starts_at);
create index events_branch_id_idx on public.events (branch_id);

create table public.rsvps (
  event_id uuid not null references public.events (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'waitlisted', 'cancelled')),
  created_by uuid references public.members (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index rsvps_member_id_idx on public.rsvps (member_id);

-- The event's team. Confers nothing outside that event.
create table public.event_staff (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  capabilities text[] not null check (
    cardinality(capabilities) > 0
    and capabilities <@ array['check_in', 'collect_payments', 'safety_lead']::text[]
  ),
  added_by uuid references public.members (id),
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index event_staff_member_id_idx on public.event_staff (member_id);

-- One check-in per member per event (arrival only). client_ref makes offline sync idempotent.
create table public.check_ins (
  event_id uuid not null references public.events (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references public.members (id),
  source text not null default 'online' check (source in ('online', 'offline_sync')),
  walk_in boolean not null default false,
  client_ref uuid not null unique,
  primary key (event_id, member_id)
);
create index check_ins_member_id_idx on public.check_ins (member_id);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_member_id uuid not null references public.members (id) on delete cascade,
  target_type text not null check (target_type ~ '^[a-z][a-z_]{0,39}$'),
  target_id uuid not null,
  reason text not null check (length(btrim(reason)) between 1 and 100),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_to uuid references public.members (id),
  resolution_note text check (resolution_note is null or length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_reporter_member_id_idx on public.reports (reporter_member_id);
create index reports_status_idx on public.reports (status);

-- ---------------------------------------------------------------------------
-- RLS on, and table privileges (default deny)
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.admin_step_ups enable row level security;
alter table public.admin_trusted_devices enable row level security;
alter table public.email_verifications enable row level security;
alter table public.otp_throttle enable row level security;
alter table public.consent_records enable row level security;
alter table public.dependent_claims enable row level security;
alter table public.roster_entries enable row level security;
alter table public.branch_transfers enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.announcements enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.event_staff enable row level security;
alter table public.check_ins enable row level security;
alter table public.reports enable row level security;

-- Anon: nothing, except reading the public app settings.
revoke all on
  public.app_settings, public.admin_step_ups, public.admin_trusted_devices, public.email_verifications,
  public.otp_throttle, public.consent_records, public.dependent_claims, public.roster_entries,
  public.branch_transfers, public.push_tokens, public.notifications, public.notification_deliveries,
  public.announcements, public.events, public.rsvps, public.event_staff, public.check_ins, public.reports
from anon;
grant select (key, value) on public.app_settings to anon;
-- Column-level read for clients too, so updated_by (a member id) never leaves the database.
revoke select on public.app_settings from authenticated;
grant select (key, value) on public.app_settings to authenticated;

-- Service role only: no client privileges at all.
revoke all on
  public.admin_step_ups, public.admin_trusted_devices, public.email_verifications, public.otp_throttle,
  public.dependent_claims, public.roster_entries, public.notification_deliveries
from authenticated;
grant select, insert, update, delete on
  public.admin_step_ups, public.admin_trusted_devices, public.email_verifications, public.otp_throttle,
  public.dependent_claims, public.roster_entries, public.notification_deliveries
to service_role;

-- Read-only for clients (writes go through security definer RPCs).
revoke insert, update, delete, truncate on
  public.app_settings, public.consent_records, public.branch_transfers, public.rsvps,
  public.event_staff, public.check_ins, public.reports
from authenticated;

-- Notifications: clients only mark them read.
revoke insert, delete, truncate on public.notifications from authenticated;

-- TRUNCATE ignores RLS.
revoke truncate on public.push_tokens, public.announcements, public.events from authenticated;

revoke all on sequence public.member_no_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers for the policies
-- ---------------------------------------------------------------------------
-- The caller's branch and wing, only while the caller is active (NULL otherwise).
create function public.current_member_branch_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.branch_id from public.members m where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

create function public.current_member_wing()
returns text
language sql stable security definer
set search_path = ''
as $$
  select m.wing from public.members m where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

-- The event's scope officers: events.national for a national event, events.branch for the
-- event's branch. has_permission applies active status, term dates and step-up.
create function public.is_event_officer(event uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = is_event_officer.event
      and (
        (e.scope = 'national' and public.has_permission('events.national'))
        or (e.scope = 'branch' and public.has_permission('events.branch', e.branch_id))
      )
  );
$$;

-- Listed staff of the event with any of the given capabilities (scope officers not included;
-- P1-00c's is_event_staff adds them). Active callers only.
create function public.is_listed_event_staff(event uuid, caps text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active() and exists (
    select 1 from public.event_staff s
    where s.event_id = is_listed_event_staff.event
      and s.member_id = public.current_member_id()
      and s.capabilities && is_listed_event_staff.caps
  );
$$;

revoke execute on function
  public.step_up_roles(), public.has_step_up(), public.current_member_branch_id(), public.current_member_wing(),
  public.is_event_officer(uuid), public.is_listed_event_staff(uuid, text[])
from public, anon;
grant execute on function
  public.step_up_roles(), public.has_step_up(), public.current_member_branch_id(), public.current_member_wing(),
  public.is_event_officer(uuid), public.is_listed_event_staff(uuid, text[])
to authenticated;
-- step_up_roles() is an internal helper for has_permission(); clients never call it.
revoke execute on function public.step_up_roles() from authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: audit direct writes, whitelist client updates, updated_at
-- ---------------------------------------------------------------------------
-- Audits a row change. tg_argv[0] names the id column; the rest name columns copied into details.
create function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  d jsonb := '{}'::jsonb;
  i int;
begin
  for i in 1 .. tg_nargs - 1 loop
    d := d || jsonb_build_object(tg_argv[i], r -> tg_argv[i]);
  end loop;
  perform public.write_audit(tg_table_name || '.' || lower(tg_op), tg_table_name, r ->> tg_argv[0], d);
  return null;
end;
$$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

create trigger announcements_audit
  after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change('id', 'scope', 'branch_id', 'audience', 'title', 'published_at', 'hidden_at');
create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.audit_row_change('id', 'scope', 'branch_id', 'audience', 'title', 'status', 'hidden_at');
-- Values are not copied into the audit log: some settings hold secrets (P1-00c).
create trigger app_settings_audit
  after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change('key', 'is_public');

-- Authors and creators are fixed once written.
create trigger announcements_update_whitelist
  before update on public.announcements
  for each row execute function public.enforce_update_whitelist(
    'scope', 'branch_id', 'audience', 'title', 'body', 'image_path', 'pinned', 'published_at', 'hidden_at', 'updated_at'
  );
-- A published event cannot go back to draft: events_delete only allows drafts, so that would be a
-- delete path for published events. Cancel or hide instead.
create function public.events_block_unpublish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and old.status <> 'draft' and new.status = 'draft' then
    raise exception 'a published event cannot be set back to draft' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger events_block_unpublish
  before update on public.events
  for each row execute function public.events_block_unpublish();
create trigger events_update_whitelist
  before update on public.events
  for each row execute function public.enforce_update_whitelist(
    'scope', 'branch_id', 'audience', 'title', 'description', 'starts_at', 'ends_at', 'venue_name', 'venue_address',
    'map_url', 'cover_path', 'capacity', 'registration_opens_at', 'registration_closes_at', 'status', 'hidden_at',
    'updated_at'
  );
create trigger notifications_update_whitelist
  before update on public.notifications
  for each row execute function public.enforce_update_whitelist('read_at');
create trigger push_tokens_update_whitelist
  before update on public.push_tokens
  for each row execute function public.enforce_update_whitelist('token', 'subscription', 'last_seen_at');

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
create trigger rsvps_set_updated_at
  before update on public.rsvps
  for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Policies (all `to authenticated` unless noted)
-- ---------------------------------------------------------------------------

-- app_settings: public rows for everyone; the rest only through security definer functions.
create policy app_settings_select_public on public.app_settings
  for select to anon, authenticated using (is_public);

-- admin_step_ups, admin_trusted_devices, email_verifications, otp_throttle, dependent_claims,
-- roster_entries, notification_deliveries: no policies (service role only).

-- announcements: active members see published, unhidden rows, national or in their branch, for
-- their wing (or 'all'). Scope officers also see drafts, scheduled and hidden rows.
create policy announcements_select_member on public.announcements
  for select to authenticated using (
    (select public.is_active())
    and published_at is not null
    and published_at <= now()
    and hidden_at is null
    and (scope = 'national' or branch_id = (select public.current_member_branch_id()))
    and (audience = 'all' or audience::text = (select public.current_member_wing()))
  );
create policy announcements_select_officer on public.announcements
  for select to authenticated using (
    (scope = 'national' and (select public.has_permission('announcements.national')))
    or (scope = 'branch' and public.has_permission('announcements.branch', branch_id))
  );
create policy announcements_insert on public.announcements
  for insert to authenticated with check (
    author_member_id = (select public.current_member_id())
    and (
      (scope = 'national' and (select public.has_permission('announcements.national')))
      or (scope = 'branch' and public.has_permission('announcements.branch', branch_id))
    )
  );
create policy announcements_update on public.announcements
  for update to authenticated
  using (
    (scope = 'national' and (select public.has_permission('announcements.national')))
    or (scope = 'branch' and public.has_permission('announcements.branch', branch_id))
  )
  with check (
    (scope = 'national' and (select public.has_permission('announcements.national')))
    or (scope = 'branch' and public.has_permission('announcements.branch', branch_id))
  );
create policy announcements_delete on public.announcements
  for delete to authenticated using (
    (scope = 'national' and (select public.has_permission('announcements.national')))
    or (scope = 'branch' and public.has_permission('announcements.branch', branch_id))
  );

-- events: same shape as announcements, with events.* permissions.
create policy events_select_member on public.events
  for select to authenticated using (
    (select public.is_active())
    and status in ('published', 'cancelled')
    and hidden_at is null
    and (scope = 'national' or branch_id = (select public.current_member_branch_id()))
    and (audience = 'all' or audience::text = (select public.current_member_wing()))
  );
create policy events_select_officer on public.events
  for select to authenticated using (
    (scope = 'national' and (select public.has_permission('events.national')))
    or (scope = 'branch' and public.has_permission('events.branch', branch_id))
  );
create policy events_insert on public.events
  for insert to authenticated with check (
    created_by = (select public.current_member_id())
    and (
      (scope = 'national' and (select public.has_permission('events.national')))
      or (scope = 'branch' and public.has_permission('events.branch', branch_id))
    )
  );
create policy events_update on public.events
  for update to authenticated
  using (
    (scope = 'national' and (select public.has_permission('events.national')))
    or (scope = 'branch' and public.has_permission('events.branch', branch_id))
  )
  with check (
    (scope = 'national' and (select public.has_permission('events.national')))
    or (scope = 'branch' and public.has_permission('events.branch', branch_id))
  );
-- Only drafts can be deleted. Published events are cancelled or hidden, never deleted, and
-- rsvps / check_ins reference events with on delete restrict.
create policy events_delete on public.events
  for delete to authenticated using (
    status = 'draft'
    and (
      (scope = 'national' and (select public.has_permission('events.national')))
      or (scope = 'branch' and public.has_permission('events.branch', branch_id))
    )
  );

-- rsvps: own (active), active guardians of the member, and the event's scope officers.
create policy rsvps_select on public.rsvps
  for select to authenticated using (
    (member_id = (select public.current_member_id()) and (select public.is_active()))
    or public.is_guardian_of(member_id)
    or public.is_event_officer(event_id)
  );

-- event_staff: the event's scope officers and the staff member themself (active).
create policy event_staff_select on public.event_staff
  for select to authenticated using (
    (member_id = (select public.current_member_id()) and (select public.is_active()))
    or public.is_event_officer(event_id)
  );

-- check_ins: scope officers, staff with check_in or safety_lead for that event, the member
-- (active) and their active guardians.
create policy check_ins_select on public.check_ins
  for select to authenticated using (
    public.is_event_officer(event_id)
    or public.is_listed_event_staff(event_id, array['check_in', 'safety_lead'])
    or (member_id = (select public.current_member_id()) and (select public.is_active()))
    or public.is_guardian_of(member_id)
  );

-- notifications: own (any status, so applicants get their approval) and active guardians'
-- wards'. Clients may change read_at only (whitelist trigger).
create policy notifications_select on public.notifications
  for select to authenticated using (
    member_id = (select public.current_member_id())
    or public.is_guardian_of(member_id)
  );
create policy notifications_update on public.notifications
  for update to authenticated
  using (member_id = (select public.current_member_id()) or public.is_guardian_of(member_id))
  with check (member_id = (select public.current_member_id()) or public.is_guardian_of(member_id));

-- push_tokens: own device tokens only (any status, so applicants get their approval push).
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (member_id = (select public.current_member_id()));
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check (member_id = (select public.current_member_id()));
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (member_id = (select public.current_member_id()));

-- consent_records: approvers of that member (members.approve for the member's branch, which
-- national and global approvers satisfy) and the member's active guardians.
create policy consent_records_select on public.consent_records
  for select to authenticated using (
    public.is_guardian_of(member_id)
    or exists (
      select 1 from public.members m
      where m.id = consent_records.member_id
        and public.has_permission('members.approve', m.branch_id)
    )
  );

-- branch_transfers: the member, their active guardians, and members.approve holders for the
-- from- or to-branch.
create policy branch_transfers_select on public.branch_transfers
  for select to authenticated using (
    member_id = (select public.current_member_id())
    or public.is_guardian_of(member_id)
    or public.has_permission('members.approve', from_branch_id)
    or public.has_permission('members.approve', to_branch_id)
  );

-- reports: reports.review sees everything. Reporters read their own reports' status through
-- my_reports() below, never the table (so reviewer notes and assignees stay hidden).
-- Inserts go through the P1-00c RPC.
create policy reports_select_reviewer on public.reports
  for select to authenticated using ((select public.has_permission('reports.review')));

-- The caller's own reports: status only, plus enough to tell them apart.
create function public.my_reports()
returns table (id uuid, target_type text, target_id uuid, status text, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.target_type, r.target_id, r.status, r.created_at, r.resolved_at
  from public.reports r
  where public.is_active()
    and r.reporter_member_id = public.current_member_id()
  order by r.created_at desc;
$$;
revoke execute on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;

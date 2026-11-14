-- P1-00b chunk 3: dependents, age transitions and branch transfers (briefs/phase-1-core.md, P1-00b).
--   add_dependent(payload)                       active, 18+ caller; creates a pending dependent + link
--   create_claim_code(dependent_id)              the dependent's guardian (is_guardian_of)
--   graduate_dependent(code)                     a signed-in caller with no member row
--   my_dependents()                              the caller's current wards
--   delete_my_account()                          the caller; no orphaned dependents, not the last super admin
--   daily_age_transitions()                      pg_cron, 01:00 IST (19:30 UTC); not callable by clients
--   give_adult_consent(payload)                  the caller, while adult_consent_required is set
--   request_branch_transfer(member_id, ...)      the member or an active guardian
--   decide_branch_transfer(id, approve, note)    members.approve for the to-branch
--   cancel_branch_transfer(id)                   the requester
-- Self-service RPCs (add_dependent, graduate, delete, consent, request/cancel transfer) have no
-- permission key: the caller acts on their own rows or a ward's, checked through is_guardian_of.
-- Payload and result shapes: packages/shared/src/schemas/membership.ts.

-- ---------------------------------------------------------------------------
-- branch_transfers.request_note (orchestrator decision 3)
-- ---------------------------------------------------------------------------
alter table public.branch_transfers
  add column request_note text check (request_note is null or length(request_note) <= 1000);

-- ---------------------------------------------------------------------------
-- claim_attempts: graduate_dependent's missed codes per login, for its rate limit (5 an hour,
-- 20 a day). Service only: RLS on, no policies, no client privileges.
-- ---------------------------------------------------------------------------
create table public.claim_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
alter table public.claim_attempts enable row level security;
revoke all on table public.claim_attempts from public, anon, authenticated;
create index claim_attempts_user_attempted_idx on public.claim_attempts (user_id, attempted_at);

-- ---------------------------------------------------------------------------
-- Internal helpers (definer-only)
-- ---------------------------------------------------------------------------

-- Branch officers (orchestrator decision 4): active members holding members.approve through a
-- current branch-scoped assignment for this branch. National and global holders are not included.
create function public.branch_officers(branch uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct ra.member_id
  from public.role_assignments ra
  join public.role_permissions rp on rp.role_key = ra.role_key
  join public.members h on h.id = ra.member_id
  where rp.permission_key = 'members.approve'
    and ra.branch_id = branch_officers.branch
    and h.status = 'active'
    and ra.starts_on <= (now() at time zone 'Asia/Kolkata')::date
    and (ra.ends_on is null or ra.ends_on >= (now() at time zone 'Asia/Kolkata')::date);
$$;
revoke execute on function public.branch_officers(uuid) from public, anon, authenticated;

-- app_settings.adult_handover_grace_days, read the same way as is_guardian_of (missing or bad: 0).
create function public.adult_handover_grace_days()
returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case when jsonb_typeof(s.value) = 'number' then greatest((s.value)::text::numeric::int, 0) end
    from public.app_settings s where s.key = 'adult_handover_grace_days'
  ), 0);
$$;
revoke execute on function public.adult_handover_grace_days() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_dependent: the caller must be active and 18 or older. The dependent is under 18, has no
-- login and no phone, joins the guardian's branch unless branch_id is given, and starts pending
-- (approve_member records the consent as guardian_account).
-- ---------------------------------------------------------------------------
create function public.add_dependent(payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  v_my_dob date;
  v_full_name text;
  v_dob date;
  v_branch uuid;
  v_relationship text;
  v_id uuid;
begin
  if me is null or not public.is_active() then
    raise exception 'add_dependent: only an active member can add a dependent' using errcode = '42501';
  end if;
  select p.dob into v_my_dob from public.member_private p where p.member_id = me;
  if v_my_dob is null or public.age_years(v_my_dob) < 18 then
    raise exception 'add_dependent: only an adult (18+) can add a dependent' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'add_dependent: payload must be a JSON object' using errcode = '22023';
  end if;

  v_full_name := btrim(payload ->> 'full_name');
  if v_full_name is null or length(v_full_name) not between 1 and 120 then
    raise exception 'add_dependent: full_name must be 1-120 characters' using errcode = '22023';
  end if;
  v_relationship := coalesce(nullif(btrim(payload ->> 'relationship'), ''), 'parent');
  if length(v_relationship) > 40 then
    raise exception 'add_dependent: relationship is limited to 40 characters' using errcode = '22023';
  end if;
  begin
    v_dob := (payload ->> 'dob')::date;
    v_branch := coalesce((payload ->> 'branch_id')::uuid, public.current_member_branch_id());
  exception when others then
    raise exception 'add_dependent: dob must be a date and branch_id a uuid' using errcode = '22023';
  end;
  if v_dob is null or v_dob > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'add_dependent: dob is missing or in the future' using errcode = '22023';
  end if;
  if public.age_years(v_dob) >= 18 then
    raise exception 'add_dependent: a dependent must be under 18' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = v_branch) then
    raise exception 'add_dependent: unknown branch' using errcode = '22023';
  end if;
  if exists (
    select 1 from (values ('gender'), ('city'), ('education')) f (key) where length(payload ->> f.key) > 120
  ) then
    raise exception 'add_dependent: text fields are limited to 120 characters' using errcode = '22023';
  end if;

  insert into public.members (user_id, full_name, branch_id, wing, status, gender, city, education)
  values (null, v_full_name, v_branch, 'youth', 'pending',
          nullif(btrim(payload ->> 'gender'), ''), nullif(btrim(payload ->> 'city'), ''),
          nullif(btrim(payload ->> 'education'), ''))
  returning id into v_id;
  insert into public.member_private (member_id, phone, dob) values (v_id, null, v_dob);
  insert into public.member_guardians (member_id, guardian_member_id, relationship)
  values (v_id, me, v_relationship);
  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (v_id, null, 'pending', 'dependent_added', me);

  perform public.write_audit('member.dependent_added', 'members', v_id::text,
    jsonb_build_object('guardian_member_id', me, 'relationship', v_relationship, 'branch_id', v_branch));

  return jsonb_build_object('member_id', v_id, 'status', 'pending');
end;
$$;
revoke execute on function public.add_dependent(jsonb) from public, anon;
grant execute on function public.add_dependent(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- create_claim_code: an 8-character code (32-symbol alphabet without 0/O/1/I) for a dependent aged
-- 14+ who has no login. Only its sha256 is stored; it expires in 7 days and replaces any unused
-- earlier code for the same dependent.
-- ---------------------------------------------------------------------------
create function public.create_claim_code(dependent_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  d record;
  v_dob date;
  v_bytes bytea;
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
  v_claim uuid;
  i integer;
begin
  if not public.is_guardian_of(create_claim_code.dependent_id) then
    raise exception 'create_claim_code: only the dependent''s guardian can create a code' using errcode = '42501';
  end if;
  select m.id, m.user_id, m.status into d from public.members m where m.id = create_claim_code.dependent_id for update;
  if d.user_id is not null then
    raise exception 'create_claim_code: the dependent already has a login' using errcode = '23514';
  end if;
  if d.status not in ('active', 'pending') then
    raise exception 'create_claim_code: the dependent''s membership is not open' using errcode = '23514';
  end if;
  select p.dob into v_dob from public.member_private p where p.member_id = d.id;
  if v_dob is null or public.age_years(v_dob) < 14 then
    raise exception 'create_claim_code: a dependent can take over the account from age 14' using errcode = '23514';
  end if;

  delete from public.dependent_claims c where c.dependent_id = d.id and c.used_at is null;

  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.dependent_claims (dependent_id, code_hash, expires_at)
      values (d.id, encode(extensions.digest(v_code, 'sha256'), 'hex'), v_expires)
      returning id into v_claim;
      exit;
    exception when unique_violation then
      null; -- astronomically rare: draw again
    end;
  end loop;

  perform public.write_audit('member.claim_code_created', 'dependent_claims', v_claim::text,
    jsonb_build_object('dependent_id', d.id, 'expires_at', v_expires));

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;
revoke execute on function public.create_claim_code(uuid) from public, anon;
grant execute on function public.create_claim_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- graduate_dependent: the dependent signs in with their own confirmed phone and redeems the code.
-- The caller's login and phone attach to the dependent. At 18+, the guardian links end ('claimed')
-- and adult_consent_required is set; at 14-17 the links stay.
-- Rate limit: a login with 5 missed codes in the last hour, or 20 in the last 24 hours, is refused
-- (PT429) before the code is looked at. A wrong or expired code records a miss in claim_attempts
-- and returns {ok: false, error: 'invalid_code'} instead of raising, so the miss is not rolled back.
-- ---------------------------------------------------------------------------
create function public.graduate_dependent(code text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_code text := upper(btrim(graduate_dependent.code));
  v_phone text;
  c record;
  d record;
  v_age integer;
  v_guardians uuid[];
  v_adult boolean;
begin
  if uid is null then
    raise exception 'graduate_dependent: sign in first' using errcode = '42501';
  end if;
  -- One redeem at a time per login, so parallel calls cannot slip past the count.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('graduate_dependent:' || uid::text, 0));
  delete from public.claim_attempts a where a.user_id = uid and a.attempted_at < now() - interval '24 hours';
  if (select count(*) from public.claim_attempts a where a.user_id = uid and a.attempted_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.claim_attempts a where a.user_id = uid) >= 20 then
    raise exception 'graduate_dependent: too many wrong codes, try again later' using errcode = 'PT429';
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9]{8}$' then
    raise exception 'graduate_dependent: the code is not valid' using errcode = '22023';
  end if;
  if exists (select 1 from public.members m where m.user_id = uid) then
    raise exception 'graduate_dependent: this login already belongs to a member' using errcode = '23514';
  end if;
  select '+' || ltrim(u.phone, '+') into v_phone
  from auth.users u
  where u.id = uid and u.phone is not null and u.phone <> '' and u.phone_confirmed_at is not null;
  if v_phone is null then
    raise exception 'graduate_dependent: a confirmed phone number is required' using errcode = '22023';
  end if;

  select dc.id, dc.dependent_id into c
  from public.dependent_claims dc
  where dc.code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
    and dc.used_at is null and dc.expires_at > now()
  for update;
  if c.id is null then
    insert into public.claim_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select m.id, m.user_id, m.status, m.full_name into d from public.members m where m.id = c.dependent_id for update;
  if d.user_id is not null then
    raise exception 'graduate_dependent: this account already has a login' using errcode = '23514';
  end if;
  select public.age_years(p.dob) into v_age from public.member_private p where p.member_id = d.id;
  if v_age is null or v_age < 14 then
    raise exception 'graduate_dependent: you can take over your account from age 14' using errcode = '23514';
  end if;
  if exists (select 1 from public.member_private p where p.phone = v_phone and p.member_id <> d.id) then
    raise exception 'graduate_dependent: this phone number belongs to another member' using errcode = '23514';
  end if;
  v_adult := v_age >= 18;

  update public.dependent_claims dc set used_at = now() where dc.id = c.id;
  delete from public.dependent_claims dc where dc.dependent_id = d.id and dc.used_at is null;
  update public.members m set user_id = uid, adult_consent_required = (m.adult_consent_required or v_adult)
  where m.id = d.id;
  update public.member_private p set phone = v_phone where p.member_id = d.id;

  select coalesce(array_agg(g.guardian_member_id), '{}') into v_guardians
  from public.member_guardians g where g.member_id = d.id and g.ended_at is null;
  if v_adult then
    update public.member_guardians g set ended_at = now(), ended_reason = 'claimed'
    where g.member_id = d.id and g.ended_at is null;
  end if;

  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (d.id, d.status, d.status, 'claimed', d.id);

  insert into public.notifications (member_id, kind, priority, title, body, data)
  select gid, 'membership.dependent_claimed', 'high', 'Account taken over',
         split_part(btrim(d.full_name), ' ', 1) || ' now signs in with their own login.'
           || case when v_adult then ' Your guardian access has ended.' else '' end,
         jsonb_build_object('member_id', d.id)
  from unnest(v_guardians) gid;

  perform public.write_audit('member.dependent_claimed', 'members', d.id::text,
    jsonb_build_object('claim_id', c.id, 'adult', v_adult, 'guardians', to_jsonb(v_guardians),
                       'links_ended', v_adult));

  return jsonb_build_object('ok', true, 'member_id', d.id, 'status', d.status, 'adult_consent_required', v_adult,
                            'guardian_links_ended', v_adult);
end;
$$;
revoke execute on function public.graduate_dependent(text) from public, anon;
grant execute on function public.graduate_dependent(text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_dependents: the caller's wards while is_guardian_of holds (active caller, active link, age
-- guard). Read-only, no audit.
-- ---------------------------------------------------------------------------
create function public.my_dependents()
returns table (
  member_id uuid,
  full_name text,
  status public.member_status,
  wing text,
  member_no text,
  branch_id uuid,
  dob date,
  relationship text,
  has_login boolean,
  claim_code_expires_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select d.id, d.full_name, d.status, d.wing, d.member_no, d.branch_id, dp.dob, g.relationship,
         d.user_id is not null,
         (select max(c.expires_at) from public.dependent_claims c
          where c.dependent_id = d.id and c.used_at is null and c.expires_at > now())
  from public.member_guardians g
  join public.members d on d.id = g.member_id
  left join public.member_private dp on dp.member_id = d.id
  where g.guardian_member_id = public.current_member_id()
    and g.ended_at is null
    and public.is_guardian_of(d.id)
  order by d.full_name, d.id;
$$;
revoke execute on function public.my_dependents() from public, anon;
grant execute on function public.my_dependents() to authenticated;

-- ---------------------------------------------------------------------------
-- delete_my_account: status 'deleted'. Refused (23514) while a ward with an active link from the
-- caller has no other active guardian, or when the caller is a current super admin and no other
-- open-ended super admin remains. The caller's own guardian links end ('removed') and pending
-- transfers they asked for, or that concern them, are cancelled.
-- ---------------------------------------------------------------------------
create function public.delete_my_account()
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  t record;
  n_links integer;
  n_transfers integer;
begin
  if me is null then
    raise exception 'delete_my_account: sign in first' using errcode = '42501';
  end if;
  select m.id, m.status into t from public.members m where m.id = me for update;
  if t.status = 'deleted' then
    raise exception 'delete_my_account: the account is already deleted' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.member_guardians g
    join public.members w on w.id = g.member_id
    join public.member_private wp on wp.member_id = g.member_id
    where g.guardian_member_id = me
      and g.ended_at is null
      and w.status not in ('deleted', 'rejected')
      -- a current dependent, by the same age rule as is_guardian_of
      and (wp.dob > (today - interval '18 years')::date
           or (w.user_id is null
               and (wp.dob + interval '18 years')::date + public.adult_handover_grace_days() > today))
      and not exists (
        select 1 from public.member_guardians o
        join public.members og on og.id = o.guardian_member_id
        where o.member_id = g.member_id and o.guardian_member_id <> me
          and o.ended_at is null and og.status = 'active'
      )
  ) then
    raise exception 'delete_my_account: a dependent of yours has no other guardian' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.role_assignments ra
    where ra.member_id = me and ra.role_key = 'super_admin'
      and ra.starts_on <= today and (ra.ends_on is null or ra.ends_on >= today)
  ) and not public.super_admin_remains(me, null) then
    raise exception 'delete_my_account: the last super admin cannot delete their account' using errcode = '23514';
  end if;

  update public.members m set status = 'deleted', status_reason = 'Deleted by the member', status_changed_at = now()
  where m.id = me;
  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (me, t.status, 'deleted', 'self_deleted', me);

  update public.member_guardians g set ended_at = now(), ended_reason = 'removed'
  where g.guardian_member_id = me and g.ended_at is null;
  get diagnostics n_links = row_count;

  update public.branch_transfers bt set status = 'cancelled', decided_by = me, decided_at = now()
  where bt.status = 'pending' and (bt.member_id = me or bt.requested_by = me);
  get diagnostics n_transfers = row_count;

  perform public.write_audit('member.self_deleted', 'members', me::text,
    jsonb_build_object('from_status', t.status, 'guardian_links_ended', n_links, 'transfers_cancelled', n_transfers));

  return jsonb_build_object('member_id', me, 'status', 'deleted');
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- daily_age_transitions: nightly at 01:00 IST. Each step selects only members still needing it,
-- so a second run on the same day changes nothing. Order matters: grace expiry runs before the
-- no-login 18th-birthday alert, so a dependent already past the grace period is not alerted.
--   1. 35+ in wing youth -> wing aiaia ('wing_change').
--   2. No login, 18th birthday + grace days reached, active links -> links end ('turned_18').
--   3. Own login, 18+, with active links or a minor consent and no adult consent yet -> links end
--      ('turned_18'), adult_consent_required, member and former guardians notified.
--   4. No login, 18+, inside the grace period, not yet alerted -> guardians and branch officers
--      notified to set up the member's own login ('turned_18_no_login' event marks it done).
-- ---------------------------------------------------------------------------
create function public.daily_age_transitions()
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  adult_dob date := (today - interval '18 years')::date;
  v_grace integer := public.adult_handover_grace_days();
  r record;
  v_guardians uuid[];
  v_flagged boolean;
  v_first text;
  n_wing integer := 0;
  n_grace integer := 0;
  n_login integer := 0;
  n_no_login integer := 0;
begin
  -- 1. Turned 35
  for r in
    select m.id, m.status from public.members m
    join public.member_private p on p.member_id = m.id
    where m.wing = 'youth' and m.status <> 'deleted' and p.dob <= (today - interval '35 years')::date
    order by m.id
    for update of m
  loop
    update public.members m set wing = 'aiaia' where m.id = r.id;
    insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
    values (r.id, r.status, r.status, 'wing_change', null);
    perform public.write_audit('member.wing_changed', 'members', r.id::text,
      jsonb_build_object('from', 'youth', 'to', 'aiaia', 'source', 'daily_age_transitions'));
    n_wing := n_wing + 1;
  end loop;

  -- 2. Dependents without a login past the handover grace period
  for r in
    select m.id, m.status from public.members m
    join public.member_private p on p.member_id = m.id
    where m.user_id is null
      and (p.dob + interval '18 years')::date + v_grace <= today
      and exists (select 1 from public.member_guardians g where g.member_id = m.id and g.ended_at is null)
    order by m.id
    for update of m
  loop
    with ended as (
      update public.member_guardians g set ended_at = now(), ended_reason = 'turned_18'
      where g.member_id = r.id and g.ended_at is null
      returning g.guardian_member_id
    )
    select coalesce(array_agg(ended.guardian_member_id), '{}') into v_guardians from ended;
    insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
    values (r.id, r.status, r.status, 'guardian_links_ended', null);
    perform public.write_audit('member.guardian_links_ended', 'members', r.id::text,
      jsonb_build_object('reason', 'grace_expired', 'grace_days', v_grace, 'guardians', to_jsonb(v_guardians),
                         'source', 'daily_age_transitions'));
    n_grace := n_grace + 1;
  end loop;

  -- 3. Turned 18 with their own login
  for r in
    select m.id, m.status, m.full_name, m.adult_consent_required, m.adult_consent_at from public.members m
    join public.member_private p on p.member_id = m.id
    where m.user_id is not null
      and m.status not in ('deleted', 'rejected')
      and p.dob <= adult_dob
      and (
        exists (select 1 from public.member_guardians g where g.member_id = m.id and g.ended_at is null)
        or (not m.adult_consent_required and m.adult_consent_at is null
            and exists (select 1 from public.consent_records c where c.member_id = m.id and c.method <> 'self_adult'))
      )
    order by m.id
    for update of m
  loop
    with ended as (
      update public.member_guardians g set ended_at = now(), ended_reason = 'turned_18'
      where g.member_id = r.id and g.ended_at is null
      returning g.guardian_member_id
    )
    select coalesce(array_agg(ended.guardian_member_id), '{}') into v_guardians from ended;

    v_flagged := not r.adult_consent_required and r.adult_consent_at is null;
    if v_flagged then
      update public.members m set adult_consent_required = true where m.id = r.id;
      insert into public.notifications (member_id, kind, priority, title, body, data)
      values (r.id, 'membership.turned_18', 'high', 'Happy 18th birthday',
              'You''re 18. Your account is now yours. Please review and give your consent.',
              jsonb_build_object('member_id', r.id));
    end if;

    v_first := split_part(btrim(r.full_name), ' ', 1);
    insert into public.notifications (member_id, kind, priority, title, body, data)
    select gid, 'membership.ward_turned_18', 'high', 'Guardian access ended',
           v_first || ' has turned 18 and now manages their own account.',
           jsonb_build_object('member_id', r.id)
    from unnest(v_guardians) gid;

    insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
    values (r.id, r.status, r.status, 'turned_18', null);
    perform public.write_audit('member.turned_18', 'members', r.id::text,
      jsonb_build_object('guardians', to_jsonb(v_guardians), 'adult_consent_required', v_flagged or r.adult_consent_required,
                         'source', 'daily_age_transitions'));
    n_login := n_login + 1;
  end loop;

  -- 4. Turned 18 without a login, still inside the grace period
  for r in
    select m.id, m.status, m.full_name, m.branch_id from public.members m
    join public.member_private p on p.member_id = m.id
    where m.user_id is null
      and m.status in ('active', 'pending')
      and p.dob <= adult_dob
      and exists (select 1 from public.member_guardians g where g.member_id = m.id and g.ended_at is null)
      and not exists (select 1 from public.member_status_events e
                      where e.member_id = m.id and e.reason = 'turned_18_no_login')
    order by m.id
    for update of m
  loop
    v_first := split_part(btrim(r.full_name), ' ', 1);
    perform public.notify_member_or_guardians(
      r.id, 'membership.dependent_turned_18', 'high',
      'Set up your own login', 'You''re 18. Ask an officer to help you set up your own login.',
      'Set up their own login',
      v_first || ' has turned 18. Please help them set up their own login within ' || v_grace || ' days.',
      jsonb_build_object('member_id', r.id)
    );
    insert into public.notifications (member_id, kind, priority, title, body, data)
    select o.officer_id, 'membership.dependent_turned_18', 'high', 'Dependent turned 18',
           'A dependent member in your branch has turned 18 and needs their own login.',
           jsonb_build_object('member_id', r.id)
    from public.branch_officers(r.branch_id) as o (officer_id);

    insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
    values (r.id, r.status, r.status, 'turned_18_no_login', null);
    perform public.write_audit('member.turned_18_no_login', 'members', r.id::text,
      jsonb_build_object('grace_days', v_grace, 'source', 'daily_age_transitions'));
    n_no_login := n_no_login + 1;
  end loop;

  return jsonb_build_object('wing_changes', n_wing, 'grace_expired', n_grace,
                            'turned_18_with_login', n_login, 'turned_18_without_login', n_no_login);
end;
$$;
revoke execute on function public.daily_age_transitions() from public, anon, authenticated;

select cron.schedule('p1_00b_daily_age_transitions', '30 19 * * *', 'select public.daily_age_transitions()');

-- ---------------------------------------------------------------------------
-- give_adult_consent: payload {whatsapp_opt_in: bool, email_updates_opt_in: bool, privacy?: {...}}.
-- The opt-in privacy keys (show_phone, show_email) are reset to false unless given as true, so
-- nothing set while a minor becomes visible without a fresh choice; other known keys are merged.
-- ---------------------------------------------------------------------------
create function public.give_adult_consent(payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  t record;
  v_privacy jsonb;
  v_whatsapp boolean;
  v_email_updates boolean;
  v_consent uuid;
  k text;
begin
  if me is null then
    raise exception 'give_adult_consent: sign in first' using errcode = '42501';
  end if;
  select m.id, m.status, m.privacy, m.adult_consent_required into t from public.members m where m.id = me for update;
  if not t.adult_consent_required or t.status in ('deleted', 'rejected') then
    raise exception 'give_adult_consent: no adult consent is due' using errcode = '23514';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or jsonb_typeof(payload -> 'whatsapp_opt_in') is distinct from 'boolean'
     or jsonb_typeof(payload -> 'email_updates_opt_in') is distinct from 'boolean'
     or (payload ? 'privacy' and jsonb_typeof(payload -> 'privacy') <> 'object') then
    raise exception 'give_adult_consent: payload needs whatsapp_opt_in and email_updates_opt_in (booleans) and an optional privacy object'
      using errcode = '22023';
  end if;
  v_whatsapp := (payload ->> 'whatsapp_opt_in')::boolean;
  v_email_updates := (payload ->> 'email_updates_opt_in')::boolean;

  v_privacy := coalesce(t.privacy, '{}'::jsonb) || jsonb_build_object('show_phone', false, 'show_email', false);
  foreach k in array array['show_phone', 'show_email', 'show_city', 'show_occupation', 'show_photo'] loop
    if jsonb_typeof(payload -> 'privacy' -> k) = 'boolean' then
      v_privacy := v_privacy || jsonb_build_object(k, payload -> 'privacy' -> k);
    end if;
  end loop;

  insert into public.consent_records (member_id, guardian_alerts, method, attested_by)
  values (me, false, 'self_adult', me)
  returning id into v_consent;
  update public.members m set privacy = v_privacy, adult_consent_required = false, adult_consent_at = now()
  where m.id = me;
  update public.member_private p
  set notify_prefs = p.notify_prefs || jsonb_build_object('whatsapp', v_whatsapp, 'email_updates', v_email_updates)
  where p.member_id = me;

  perform public.write_audit('member.adult_consent_given', 'consent_records', v_consent::text,
    jsonb_build_object('member_id', me, 'privacy', v_privacy, 'whatsapp', v_whatsapp, 'email_updates', v_email_updates));

  return jsonb_build_object('member_id', me, 'consent_record_id', v_consent, 'privacy', v_privacy);
end;
$$;
revoke execute on function public.give_adult_consent(jsonb) from public, anon;
grant execute on function public.give_adult_consent(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- request_branch_transfer: the active member themselves, or an active guardian (is_guardian_of).
-- One pending request per member (branch_transfers_one_pending_idx). To-branch officers are
-- notified; the text names nobody.
-- ---------------------------------------------------------------------------
create function public.request_branch_transfer(member_id uuid, to_branch_id uuid, reason text default null,
                                               note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  t record;
  v_reason text := nullif(btrim(request_branch_transfer.reason), '');
  v_note text := nullif(btrim(request_branch_transfer.note), '');
  v_id uuid;
  n integer;
begin
  if me is null
     or not (request_branch_transfer.member_id = me or public.is_guardian_of(request_branch_transfer.member_id)) then
    raise exception 'request_branch_transfer: only the member or their guardian can ask' using errcode = '42501';
  end if;
  select m.id, m.branch_id, m.status into t from public.members m
  where m.id = request_branch_transfer.member_id for update;
  if t.status is distinct from 'active' then
    raise exception 'request_branch_transfer: only an active member can transfer' using errcode = '23514';
  end if;
  if not exists (select 1 from public.branches b where b.id = request_branch_transfer.to_branch_id) then
    raise exception 'request_branch_transfer: unknown branch' using errcode = '22023';
  end if;
  if t.branch_id = request_branch_transfer.to_branch_id then
    raise exception 'request_branch_transfer: the member is already in that branch' using errcode = '23514';
  end if;
  if length(v_reason) > 1000 or length(v_note) > 1000 then
    raise exception 'request_branch_transfer: reason and note are limited to 1000 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.branch_transfers bt where bt.member_id = t.id and bt.status = 'pending') then
    raise exception 'request_branch_transfer: a transfer request is already pending' using errcode = '23514';
  end if;

  insert into public.branch_transfers (member_id, from_branch_id, to_branch_id, reason, request_note, requested_by)
  values (t.id, t.branch_id, request_branch_transfer.to_branch_id, v_reason, v_note, me)
  returning id into v_id;

  insert into public.notifications (member_id, kind, priority, title, body, data)
  select o.officer_id, 'membership.transfer_requested', 'high', 'Branch transfer request',
         'A member has asked to transfer to your branch. Open the transfer queue to decide.',
         jsonb_build_object('transfer_id', v_id)
  from public.branch_officers(request_branch_transfer.to_branch_id) as o (officer_id);
  get diagnostics n = row_count;

  perform public.write_audit('member.transfer_requested', 'branch_transfers', v_id::text,
    jsonb_build_object('member_id', t.id, 'from_branch_id', t.branch_id,
                       'to_branch_id', request_branch_transfer.to_branch_id, 'notified', n));

  return jsonb_build_object('transfer_id', v_id, 'status', 'pending', 'notified', n);
end;
$$;
revoke execute on function public.request_branch_transfer(uuid, uuid, text, text) from public, anon;
grant execute on function public.request_branch_transfer(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- decide_branch_transfer: members.approve for the to-branch (national and global holders count).
-- Nobody decides their own transfer. On approval the branch changes, the member's branch-scoped
-- role assignments in the old branch end yesterday (IST), or are withdrawn if they start today or
-- later (as end_role does), and the member and from-branch officers are notified.
-- ---------------------------------------------------------------------------
create function public.decide_branch_transfer(id uuid, approve boolean, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  t record;
  m record;
  a record;
  v_note text := nullif(btrim(decide_branch_transfer.note), '');
  v_status text;
  v_withdrawn boolean;
  n_roles integer := 0;
begin
  select bt.id, bt.member_id, bt.from_branch_id, bt.to_branch_id, bt.status into t
  from public.branch_transfers bt where bt.id = decide_branch_transfer.id for update;
  if t.id is null then
    raise exception 'decide_branch_transfer: unknown transfer' using errcode = '22023';
  end if;
  if not public.has_permission('members.approve', t.to_branch_id) or t.member_id = me then
    raise exception 'decide_branch_transfer: members.approve for the receiving branch is required' using errcode = '42501';
  end if;
  if decide_branch_transfer.approve is null then
    raise exception 'decide_branch_transfer: approve must be true or false' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then
    raise exception 'decide_branch_transfer: note is limited to 1000 characters' using errcode = '22023';
  end if;
  if t.status <> 'pending' then
    raise exception 'decide_branch_transfer: the transfer is no longer pending' using errcode = '23514';
  end if;

  select mm.id, mm.branch_id, mm.status into m from public.members mm where mm.id = t.member_id for update;
  if decide_branch_transfer.approve and m.branch_id <> t.from_branch_id then
    raise exception 'decide_branch_transfer: the member has changed branch since the request' using errcode = '23514';
  end if;

  v_status := case when decide_branch_transfer.approve then 'approved' else 'rejected' end;
  update public.branch_transfers bt set status = v_status, decided_by = me, decided_at = now(), decision_note = v_note
  where bt.id = t.id;

  if decide_branch_transfer.approve then
    update public.members mm set branch_id = t.to_branch_id where mm.id = t.member_id;
    insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
    values (t.member_id, m.status, m.status, 'branch_transfer', me);

    for a in
      select ra.id, ra.role_key, ra.starts_on from public.role_assignments ra
      join public.roles r on r.key = ra.role_key
      where ra.member_id = t.member_id and r.scope = 'branch' and ra.branch_id = t.from_branch_id
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
        jsonb_build_object('member_id', t.member_id, 'role_key', a.role_key, 'branch_id', t.from_branch_id,
                           'starts_on', a.starts_on, 'ends_on', today - 1, 'withdrawn', v_withdrawn,
                           'reason', 'branch_transfer', 'transfer_id', t.id));
      n_roles := n_roles + 1;
    end loop;

    perform public.notify_member_or_guardians(
      t.member_id, 'membership.transfer_approved', 'high',
      'Branch transfer approved', 'Your branch transfer was approved.',
      'Branch transfer approved', 'A branch transfer you asked for was approved.',
      jsonb_build_object('transfer_id', t.id)
    );
    insert into public.notifications (member_id, kind, priority, title, body, data)
    select o.officer_id, 'membership.transfer_out', 'high', 'Member transferred',
           'A member has transferred out of your branch.', jsonb_build_object('transfer_id', t.id)
    from public.branch_officers(t.from_branch_id) as o (officer_id);
  else
    perform public.notify_member_or_guardians(
      t.member_id, 'membership.transfer_rejected', 'high',
      'Branch transfer declined', 'Your branch transfer request was declined.',
      'Branch transfer declined', 'A branch transfer you asked for was declined.',
      jsonb_build_object('transfer_id', t.id)
    );
  end if;

  perform public.write_audit('member.transfer_' || v_status, 'branch_transfers', t.id::text,
    jsonb_build_object('member_id', t.member_id, 'from_branch_id', t.from_branch_id, 'to_branch_id', t.to_branch_id,
                       'roles_ended', n_roles));

  return jsonb_build_object('transfer_id', t.id, 'status', v_status, 'roles_ended', n_roles);
end;
$$;
revoke execute on function public.decide_branch_transfer(uuid, boolean, text) from public, anon;
grant execute on function public.decide_branch_transfer(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_branch_transfer: only the member who asked, while it is pending.
-- ---------------------------------------------------------------------------
create function public.cancel_branch_transfer(id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  t record;
begin
  select bt.id, bt.member_id, bt.requested_by, bt.status into t
  from public.branch_transfers bt where bt.id = cancel_branch_transfer.id for update;
  if t.id is null then
    raise exception 'cancel_branch_transfer: unknown transfer' using errcode = '22023';
  end if;
  if me is null or t.requested_by is distinct from me then
    raise exception 'cancel_branch_transfer: only the requester can cancel' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'cancel_branch_transfer: the transfer is no longer pending' using errcode = '23514';
  end if;

  update public.branch_transfers bt set status = 'cancelled', decided_by = me, decided_at = now()
  where bt.id = t.id;
  perform public.write_audit('member.transfer_cancelled', 'branch_transfers', t.id::text,
    jsonb_build_object('member_id', t.member_id));

  return jsonb_build_object('transfer_id', t.id, 'status', 'cancelled');
end;
$$;
revoke execute on function public.cancel_branch_transfer(uuid) from public, anon;
grant execute on function public.cancel_branch_transfer(uuid) to authenticated;

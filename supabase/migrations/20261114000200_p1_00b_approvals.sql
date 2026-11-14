-- P1-00b chunk 1: applications and approval decisions (briefs/phase-1-core.md, P1-00b items 1, 2, 5).
--   submit_application(payload)            the caller's own pending application
--   approve_member(member_id, consent)     members.approve for the member's branch
--   reject_member(member_id, reason)       members.approve for the member's branch
--   request_info(member_id, message)       members.approve for the member's branch
--   my_profile()                           the caller's own rows plus their dependents
-- Applicants in wing 'aiaia' (35+) can only be decided by a national or global members.approve
-- holder: has_permission('members.approve', null) ignores branch grants.
-- Payload and result shapes: packages/shared/src/schemas/membership.ts.

-- ---------------------------------------------------------------------------
-- Internal helpers (definer-only; reusable by later P1-00b chunks)
-- ---------------------------------------------------------------------------

-- Whole years of age on today's date in Asia/Kolkata. Null for a null date.
create function public.age_years(d date)
returns integer
language sql stable
set search_path = ''
as $$
  select extract(year from age((now() at time zone 'Asia/Kolkata')::date, d))::integer;
$$;
revoke execute on function public.age_years(date) from public, anon, authenticated;

-- Notifies a member, or, for a member without a login, each guardian on an active link.
-- Returns the number of notifications written.
create function public.notify_member_or_guardians(
  target uuid,
  kind text,
  priority text,
  self_title text,
  self_body text,
  guardian_title text,
  guardian_body text,
  data jsonb default '{}'::jsonb
)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  has_login boolean;
  n integer;
begin
  select m.user_id is not null into has_login from public.members m where m.id = target;
  if has_login is null then
    raise exception 'notify_member_or_guardians: unknown member' using errcode = '22023';
  end if;

  if has_login then
    insert into public.notifications (member_id, kind, priority, title, body, data)
    values (target, notify_member_or_guardians.kind, notify_member_or_guardians.priority,
            self_title, self_body, coalesce(notify_member_or_guardians.data, '{}'::jsonb));
    return 1;
  end if;

  insert into public.notifications (member_id, kind, priority, title, body, data)
  select g.guardian_member_id, notify_member_or_guardians.kind, notify_member_or_guardians.priority,
         guardian_title, guardian_body, coalesce(notify_member_or_guardians.data, '{}'::jsonb)
  from public.member_guardians g
  where g.member_id = target and g.ended_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.notify_member_or_guardians(uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_application
-- ---------------------------------------------------------------------------
-- Self-service: no permission applies (the caller is not yet a member). The caller must be signed
-- in with a confirmed phone, which becomes member_private.phone; the payload never sets the phone.
-- Only a caller with no member row, or a pending one, may submit. Under-14s are refused.
create function public.submit_application(payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_phone text;
  v_member_id uuid;
  v_status public.member_status;
  v_full_name text;
  v_dob date;
  v_branch uuid;
  v_age integer;
  v_wing text;
  v_email text;
  v_ec_phone text;
  v_privacy jsonb := '{}'::jsonb;
  v_whatsapp boolean;
  v_email_updates boolean;
  v_fast_track boolean;
  v_created boolean := false;
  k text;
begin
  if uid is null then
    raise exception 'submit_application: sign in first' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'submit_application: payload must be a JSON object' using errcode = '22023';
  end if;

  select '+' || ltrim(u.phone, '+') into v_phone
  from auth.users u
  where u.id = uid and u.phone is not null and u.phone <> '' and u.phone_confirmed_at is not null;
  if v_phone is null then
    raise exception 'submit_application: a confirmed phone number is required' using errcode = '22023';
  end if;

  select m.id, m.status into v_member_id, v_status from public.members m where m.user_id = uid for update;
  if v_member_id is not null and v_status <> 'pending' then
    raise exception 'submit_application: only a pending application can be changed' using errcode = '23514';
  end if;

  v_full_name := btrim(payload ->> 'full_name');
  if v_full_name is null or length(v_full_name) not between 1 and 120 then
    raise exception 'submit_application: full_name must be 1-120 characters' using errcode = '22023';
  end if;

  begin
    v_dob := (payload ->> 'dob')::date;
    v_branch := (payload ->> 'branch_id')::uuid;
  exception when others then
    raise exception 'submit_application: dob must be a date and branch_id a uuid' using errcode = '22023';
  end;
  if v_dob is null or v_dob > (now() at time zone 'Asia/Kolkata')::date or v_dob < date '1900-01-01' then
    raise exception 'submit_application: dob is missing or out of range' using errcode = '22023';
  end if;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch) then
    raise exception 'submit_application: unknown branch' using errcode = '22023';
  end if;

  if v_member_id is not null
     and exists (select 1 from public.member_guardians g where g.member_id = v_member_id and g.ended_at is null)
     and exists (select 1 from public.member_private p where p.member_id = v_member_id and p.dob is distinct from v_dob) then
    raise exception 'submit_application: date of birth can only be changed by an officer while a guardian link is active'
      using errcode = '42501';
  end if;

  v_age := public.age_years(v_dob);
  if v_age < 14 then
    raise exception 'submit_application: under 14, ask a parent or guardian to add you' using errcode = '23514';
  end if;
  v_wing := case when v_age >= 35 then 'aiaia' else 'youth' end;

  if exists (
    select 1 from (values ('gender'), ('city'), ('occupation'), ('education'), ('emergency_contact_name')) f (key)
    where length(payload ->> f.key) > 120
  ) then
    raise exception 'submit_application: text fields are limited to 120 characters' using errcode = '22023';
  end if;

  v_email := nullif(btrim(payload ->> 'email'), '');
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'submit_application: email is not valid' using errcode = '22023';
  end if;
  v_ec_phone := nullif(btrim(payload ->> 'emergency_contact_phone'), '');
  if v_ec_phone is not null and v_ec_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'submit_application: emergency_contact_phone must be in +<country><number> form' using errcode = '22023';
  end if;

  if payload ? 'privacy' then
    if jsonb_typeof(payload -> 'privacy') <> 'object' then
      raise exception 'submit_application: privacy must be an object' using errcode = '22023';
    end if;
    foreach k in array array['show_phone', 'show_email', 'show_city', 'show_occupation', 'show_photo'] loop
      if jsonb_typeof(payload -> 'privacy' -> k) = 'boolean' then
        v_privacy := v_privacy || jsonb_build_object(k, payload -> 'privacy' -> k);
      end if;
    end loop;
  end if;
  v_whatsapp := coalesce(case when jsonb_typeof(payload -> 'whatsapp_opt_in') = 'boolean' then (payload ->> 'whatsapp_opt_in')::boolean end, false);
  v_email_updates := coalesce(case when jsonb_typeof(payload -> 'email_updates_opt_in') = 'boolean' then (payload ->> 'email_updates_opt_in')::boolean end, false);

  if v_member_id is null then
    insert into public.members (user_id, full_name, branch_id, wing, status, gender, city, occupation, education, privacy)
    values (uid, v_full_name, v_branch, v_wing, 'pending',
            nullif(btrim(payload ->> 'gender'), ''), nullif(btrim(payload ->> 'city'), ''),
            nullif(btrim(payload ->> 'occupation'), ''), nullif(btrim(payload ->> 'education'), ''),
            v_privacy)
    returning id into v_member_id;
    v_created := true;
    insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
    values (v_member_id, null, 'pending', 'application', v_member_id);
  else
    update public.members m set
      full_name = v_full_name,
      branch_id = v_branch,
      wing = v_wing,
      gender = nullif(btrim(payload ->> 'gender'), ''),
      city = nullif(btrim(payload ->> 'city'), ''),
      occupation = nullif(btrim(payload ->> 'occupation'), ''),
      education = nullif(btrim(payload ->> 'education'), ''),
      privacy = v_privacy
    where m.id = v_member_id;
  end if;

  insert into public.member_private as p (member_id, phone, dob, email, emergency_contact_name, emergency_contact_phone, notify_prefs)
  values (v_member_id, v_phone, v_dob, v_email::extensions.citext,
          nullif(btrim(payload ->> 'emergency_contact_name'), ''), v_ec_phone,
          jsonb_build_object('push', true, 'email_updates', v_email_updates, 'email_receipts', false, 'whatsapp', v_whatsapp))
  on conflict (member_id) do update set
    phone = excluded.phone,
    dob = excluded.dob,
    email = excluded.email,
    email_verified_at = case when p.email is not distinct from excluded.email then p.email_verified_at end,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    notify_prefs = p.notify_prefs || jsonb_build_object('email_updates', v_email_updates, 'whatsapp', v_whatsapp);

  v_fast_track := exists (
    select 1 from public.roster_entries r where r.phone = v_phone and r.claimed_member_id is null
  );

  perform public.write_audit(
    'member.application_submitted', 'members', v_member_id::text,
    jsonb_build_object('created', v_created, 'wing', v_wing, 'fast_track', v_fast_track)
  );

  return jsonb_build_object('member_id', v_member_id, 'status', 'pending', 'wing', v_wing, 'fast_track', v_fast_track);
end;
$$;
revoke execute on function public.submit_application(jsonb) from public, anon;
grant execute on function public.submit_application(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_member
-- ---------------------------------------------------------------------------
-- consent (only read for minors):
--   * 14-17 (not a dependent): required. {method: paper_form|phone_call|in_person, guardian_name,
--     guardian_phone, guardian_alerts: boolean, document_path?}
--   * dependent (no login, active guardian link): recorded as guardian_account for the first active
--     guardian; consent.guardian_alerts (boolean) is used when given, else false.
--   * under 14 and not a dependent: refused.
create function public.approve_member(member_id uuid, consent jsonb default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  t record;
  v_dob date;
  v_age integer;
  v_guardian_id uuid;
  v_guardian_name text;
  v_guardian_phone text;
  v_method public.consent_method;
  v_alerts boolean;
  v_consent_id uuid;
  v_member_no text;
  v_first text;
begin
  select m.id, m.branch_id, m.wing, m.status, m.user_id, m.full_name into t
  from public.members m where m.id = approve_member.member_id for update;
  if t.id is null then
    raise exception 'approve_member: unknown member' using errcode = '22023';
  end if;
  if not public.has_permission('members.approve', t.branch_id) then
    raise exception 'approve_member: members.approve for this branch is required' using errcode = '42501';
  end if;
  if t.wing = 'aiaia' and not public.has_permission('members.approve', null) then
    raise exception 'approve_member: AIAIA-wing applicants need a national approver' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'approve_member: only a pending member can be approved' using errcode = '23514';
  end if;

  select p.dob into v_dob from public.member_private p where p.member_id = t.id;
  if v_dob is null then
    raise exception 'approve_member: the member has no date of birth on record' using errcode = '23514';
  end if;
  v_age := public.age_years(v_dob);

  if v_age < 18 then
    if t.user_id is null then
      select g.guardian_member_id, gm.full_name, gp.phone into v_guardian_id, v_guardian_name, v_guardian_phone
      from public.member_guardians g
      join public.members gm on gm.id = g.guardian_member_id
      left join public.member_private gp on gp.member_id = g.guardian_member_id
      where g.member_id = t.id and g.ended_at is null and gm.status = 'active'
      order by g.created_at, g.guardian_member_id
      limit 1;
    end if;

    if v_guardian_id is not null then
      -- Dependent: the guardian consented by creating the account.
      v_alerts := coalesce(case when jsonb_typeof(consent -> 'guardian_alerts') = 'boolean'
                                then (consent ->> 'guardian_alerts')::boolean end, false);
      insert into public.consent_records (member_id, guardian_name, guardian_phone, guardian_alerts, method, attested_by)
      values (t.id, v_guardian_name, v_guardian_phone, v_alerts, 'guardian_account', me)
      returning id into v_consent_id;
      v_method := 'guardian_account';
    else
      if v_age < 14 then
        raise exception 'approve_member: under-14s join only as a guardian''s dependent' using errcode = '23514';
      end if;
      if consent is null then
        raise exception 'approve_member: a guardian consent is required for ages 14-17' using errcode = '23514';
      end if;
      if jsonb_typeof(consent) <> 'object'
         or coalesce(consent ->> 'method', '') not in ('paper_form', 'phone_call', 'in_person')
         or length(btrim(coalesce(consent ->> 'guardian_name', ''))) not between 1 and 120
         or coalesce(consent ->> 'guardian_phone', '') !~ '^\+[1-9][0-9]{7,14}$'
         or jsonb_typeof(consent -> 'guardian_alerts') is distinct from 'boolean'
         or (consent ? 'document_path' and jsonb_typeof(consent -> 'document_path') not in ('string', 'null')) then
        raise exception 'approve_member: consent needs method (paper_form, phone_call or in_person), guardian_name, guardian_phone and guardian_alerts'
          using errcode = '22023';
      end if;
      v_method := (consent ->> 'method')::public.consent_method;
      v_alerts := (consent ->> 'guardian_alerts')::boolean;
      insert into public.consent_records (member_id, guardian_name, guardian_phone, guardian_alerts, method, document_path, attested_by)
      values (t.id, btrim(consent ->> 'guardian_name'), consent ->> 'guardian_phone', v_alerts, v_method,
              nullif(consent ->> 'document_path', ''), me)
      returning id into v_consent_id;
    end if;
  end if;

  v_member_no := 'AIAIA-' || case when t.wing = 'aiaia' then 'A' else 'Y' end || '-'
                 || lpad(nextval('public.member_no_seq')::text, 6, '0');

  update public.members m set
    status = 'active',
    status_reason = null,
    status_changed_at = now(),
    approved_by = me,
    approved_at = now(),
    member_no = v_member_no
  where m.id = t.id;

  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (t.id, 'pending', 'active', 'approved', me);

  v_first := split_part(btrim(t.full_name), ' ', 1);
  perform public.notify_member_or_guardians(
    t.id, 'membership.approved', 'high',
    'Welcome to AIAIA', 'Your membership is approved. Your member number is ' || v_member_no || '.',
    'Membership approved', v_first || '''s membership is approved. Member number ' || v_member_no || '.',
    jsonb_build_object('member_id', t.id, 'member_no', v_member_no)
  );

  perform public.write_audit(
    'member.approved', 'members', t.id::text,
    jsonb_build_object('member_no', v_member_no, 'wing', t.wing, 'consent_method', v_method, 'consent_record_id', v_consent_id)
  );

  return jsonb_build_object('member_id', t.id, 'status', 'active', 'member_no', v_member_no, 'consent_record_id', v_consent_id);
end;
$$;
revoke execute on function public.approve_member(uuid, jsonb) from public, anon;
grant execute on function public.approve_member(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- reject_member
-- ---------------------------------------------------------------------------
create function public.reject_member(member_id uuid, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  t record;
  v_reason text := btrim(reject_member.reason);
  v_first text;
begin
  select m.id, m.branch_id, m.wing, m.status, m.full_name into t
  from public.members m where m.id = reject_member.member_id for update;
  if t.id is null then
    raise exception 'reject_member: unknown member' using errcode = '22023';
  end if;
  if not public.has_permission('members.approve', t.branch_id) then
    raise exception 'reject_member: members.approve for this branch is required' using errcode = '42501';
  end if;
  if t.wing = 'aiaia' and not public.has_permission('members.approve', null) then
    raise exception 'reject_member: AIAIA-wing applicants need a national approver' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'reject_member: only a pending member can be rejected' using errcode = '23514';
  end if;
  if v_reason is null or length(v_reason) not between 1 and 500 then
    raise exception 'reject_member: reason must be 1-500 characters' using errcode = '22023';
  end if;

  update public.members m set status = 'rejected', status_reason = v_reason, status_changed_at = now()
  where m.id = t.id;

  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (t.id, 'pending', 'rejected', v_reason, me);

  v_first := split_part(btrim(t.full_name), ' ', 1);
  perform public.notify_member_or_guardians(
    t.id, 'membership.rejected', 'high',
    'Application update', 'Your application was not approved. Open the app for details.',
    'Application update', v_first || '''s application was not approved. Open the app for details.',
    jsonb_build_object('member_id', t.id)
  );

  perform public.write_audit('member.rejected', 'members', t.id::text, jsonb_build_object('reason', v_reason));

  return jsonb_build_object('member_id', t.id, 'status', 'rejected');
end;
$$;
revoke execute on function public.reject_member(uuid, text) from public, anon;
grant execute on function public.reject_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- request_info
-- ---------------------------------------------------------------------------
-- Leaves the member pending; the message reaches them (or their guardians) as a notification,
-- which the waiting room shows.
create function public.request_info(member_id uuid, message text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  t record;
  v_message text := btrim(request_info.message);
  v_sent integer;
begin
  select m.id, m.branch_id, m.wing, m.status into t
  from public.members m where m.id = request_info.member_id for update;
  if t.id is null then
    raise exception 'request_info: unknown member' using errcode = '22023';
  end if;
  if not public.has_permission('members.approve', t.branch_id) then
    raise exception 'request_info: members.approve for this branch is required' using errcode = '42501';
  end if;
  if t.wing = 'aiaia' and not public.has_permission('members.approve', null) then
    raise exception 'request_info: AIAIA-wing applicants need a national approver' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'request_info: only a pending member can be asked for information' using errcode = '23514';
  end if;
  if v_message is null or length(v_message) not between 1 and 1000 then
    raise exception 'request_info: message must be 1-1000 characters' using errcode = '22023';
  end if;

  v_sent := public.notify_member_or_guardians(
    t.id, 'membership.info_requested', 'high',
    'More information needed', 'An officer has asked for more information about your application. Open the app to see the request.',
    'More information needed', 'An officer has asked for more information about your application. Open the app to see the request.',
    jsonb_build_object('member_id', t.id, 'message', v_message)
  );

  perform public.write_audit('member.info_requested', 'members', t.id::text, jsonb_build_object('message', v_message));

  return jsonb_build_object('member_id', t.id, 'status', 'pending', 'notified', v_sent);
end;
$$;
revoke execute on function public.request_info(uuid, text) from public, anon;
grant execute on function public.request_info(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_profile
-- ---------------------------------------------------------------------------
-- Null when the caller has no member row (the auth gate routes to profile setup). Works in any
-- status, since it returns only the caller's own rows. Dependents are listed only while
-- is_guardian_of holds (active caller, active link, age guard).
create function public.my_profile()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'member', to_jsonb(m),
    'private', (select to_jsonb(p) from public.member_private p where p.member_id = m.id),
    'dependents', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'full_name', d.full_name,
          'status', d.status,
          'wing', d.wing,
          'member_no', d.member_no,
          'has_login', d.user_id is not null,
          'dob', dp.dob,
          'relationship', g.relationship
        ) order by d.full_name, d.id)
      from public.member_guardians g
      join public.members d on d.id = g.member_id
      left join public.member_private dp on dp.member_id = d.id
      where g.guardian_member_id = m.id
        and g.ended_at is null
        and public.is_guardian_of(d.id)
    ), '[]'::jsonb)
  )
  from public.members m
  where m.user_id = (select auth.uid());
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

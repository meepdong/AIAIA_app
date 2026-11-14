-- P1-00b chunk 2: blocking and roles (briefs/phase-1-core.md, P1-00b items 3 and 4).
--   block_member(member_id, reason)        members.block (super admins, Enforcement Committee)
--   unblock_member(member_id)              members.block
--   request_block(member_id, reason)       members.request_block (the Mentor); status unchanged
--   assign_role(member_id, role_key, ...)  roles.assign; global-scope roles also need system.config
--   end_role(assignment_id, ends_on)       roles.assign; global-scope roles also need system.config
-- Invariant: at least one active member keeps a current, open-ended super_admin assignment.
-- Neither end_role nor block_member may remove the last one (23514).
-- Payload and result shapes: packages/shared/src/schemas/membership.ts.
-- P1-00c's review_report(..., 'block') calls block_member(uuid, text): keep that signature.

-- ---------------------------------------------------------------------------
-- reports.priority (orchestrator decision 1). request_block files 'high'.
-- ---------------------------------------------------------------------------
alter table public.reports
  add column priority text not null default 'normal' check (priority in ('high', 'normal'));

-- ---------------------------------------------------------------------------
-- Internal helper (definer-only)
-- ---------------------------------------------------------------------------

-- True when, leaving out one member and/or one assignment, some active member still holds a
-- super_admin assignment that has started and has no end date. Locks every super_admin
-- assignment first, so two concurrent removals cannot each see the other as the survivor.
-- This guards an invariant; it is not a permission check (those go through has_permission).
create function public.super_admin_remains(excluding_member uuid, excluding_assignment uuid)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform 1 from public.role_assignments ra where ra.role_key = 'super_admin' for update;
  return exists (
    select 1
    from public.role_assignments ra
    join public.members m on m.id = ra.member_id
    where ra.role_key = 'super_admin'
      and m.status = 'active'
      and ra.starts_on <= today
      and ra.ends_on is null
      and (excluding_member is null or ra.member_id <> excluding_member)
      and (excluding_assignment is null or ra.id <> excluding_assignment)
  );
end;
$$;
revoke execute on function public.super_admin_remains(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- block_member
-- ---------------------------------------------------------------------------
create function public.block_member(member_id uuid, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  t record;
  v_reason text := btrim(block_member.reason);
  closed integer;
begin
  if not public.has_permission('members.block') then
    raise exception 'block_member: members.block is required' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) not between 1 and 500 then
    raise exception 'block_member: reason must be 1-500 characters' using errcode = '22023';
  end if;

  select m.id, m.status into t from public.members m where m.id = block_member.member_id for update;
  if t.id is null then
    raise exception 'block_member: unknown member' using errcode = '22023';
  end if;
  if t.id = me then
    raise exception 'block_member: you cannot block yourself' using errcode = '23514';
  end if;
  if t.status not in ('active', 'pending') then
    raise exception 'block_member: only an active or pending member can be blocked' using errcode = '23514';
  end if;
  if exists (
       select 1 from public.role_assignments ra
       where ra.member_id = t.id and ra.role_key = 'super_admin'
         and ra.starts_on <= today and (ra.ends_on is null or ra.ends_on >= today))
     and not public.super_admin_remains(t.id, null) then
    raise exception 'block_member: the last super admin cannot be blocked' using errcode = '23514';
  end if;

  update public.members m
  set status = 'suspended', status_reason = v_reason, status_changed_at = now()
  where m.id = t.id;

  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (t.id, t.status, 'suspended', v_reason, me);

  update public.reports r
  set status = 'resolved', assigned_to = me, resolution_note = 'Member blocked', resolved_at = now()
  where r.target_type = 'member' and r.target_id = t.id
    and r.reason = 'block_request' and r.status in ('open', 'in_review');
  get diagnostics closed = row_count;

  perform public.write_audit('member.blocked', 'members', t.id::text,
    jsonb_build_object('reason', v_reason, 'from_status', t.status, 'closed_block_requests', closed));

  return jsonb_build_object('member_id', t.id, 'status', 'suspended', 'closed_block_requests', closed);
end;
$$;
revoke execute on function public.block_member(uuid, text) from public, anon;
grant execute on function public.block_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unblock_member: back to active if the member was ever approved, else back to pending,
-- so a blocked applicant never skips approval.
-- ---------------------------------------------------------------------------
create function public.unblock_member(member_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  t record;
  v_to public.member_status;
begin
  if not public.has_permission('members.block') then
    raise exception 'unblock_member: members.block is required' using errcode = '42501';
  end if;

  select m.id, m.status, m.approved_at into t from public.members m
  where m.id = unblock_member.member_id for update;
  if t.id is null then
    raise exception 'unblock_member: unknown member' using errcode = '22023';
  end if;
  if t.status <> 'suspended' then
    raise exception 'unblock_member: only a suspended member can be unblocked' using errcode = '23514';
  end if;

  v_to := case when t.approved_at is not null then 'active' else 'pending' end;

  update public.members m
  set status = v_to, status_reason = null, status_changed_at = now()
  where m.id = t.id;

  insert into public.member_status_events (member_id, from_status, to_status, reason, changed_by)
  values (t.id, 'suspended', v_to, 'unblocked', me);

  perform public.write_audit('member.unblocked', 'members', t.id::text, jsonb_build_object('to_status', v_to));

  return jsonb_build_object('member_id', t.id, 'status', v_to);
end;
$$;
revoke execute on function public.unblock_member(uuid) from public, anon;
grant execute on function public.unblock_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- request_block: files a high-priority 'block_request' report and alerts every current holder of
-- members.block (found through role grants and term dates, step-up or not). The reason goes in
-- reports.details; notification text names nobody.
-- ---------------------------------------------------------------------------
create function public.request_block(member_id uuid, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  t record;
  v_reason text := btrim(request_block.reason);
  v_report uuid;
  n integer;
begin
  if not public.has_permission('members.request_block') then
    raise exception 'request_block: members.request_block is required' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) not between 1 and 2000 then
    raise exception 'request_block: reason must be 1-2000 characters' using errcode = '22023';
  end if;

  select m.id, m.status into t from public.members m where m.id = request_block.member_id for update;
  if t.id is null then
    raise exception 'request_block: unknown member' using errcode = '22023';
  end if;
  if t.id = me then
    raise exception 'request_block: you cannot request your own block' using errcode = '23514';
  end if;
  if t.status not in ('active', 'pending') then
    raise exception 'request_block: only an active or pending member can be blocked' using errcode = '23514';
  end if;
  if exists (select 1 from public.reports r
             where r.target_type = 'member' and r.target_id = t.id
               and r.reason = 'block_request' and r.status in ('open', 'in_review')) then
    raise exception 'request_block: a block request for this member is already open' using errcode = '23514';
  end if;

  insert into public.reports (reporter_member_id, target_type, target_id, reason, details, priority)
  values (me, 'member', t.id, 'block_request', v_reason, 'high')
  returning id into v_report;

  insert into public.notifications (member_id, kind, priority, title, body, data)
  select distinct ra.member_id, 'membership.block_requested', 'high', 'Block request',
         'The Mentor has asked for a member to be blocked. Open the enforcement queue to review it.',
         jsonb_build_object('report_id', v_report)
  from public.role_assignments ra
  join public.role_permissions rp on rp.role_key = ra.role_key
  join public.members h on h.id = ra.member_id
  where rp.permission_key = 'members.block'
    and h.status = 'active'
    and ra.starts_on <= today
    and (ra.ends_on is null or ra.ends_on >= today)
    and ra.member_id <> me;
  get diagnostics n = row_count;

  perform public.write_audit('member.block_requested', 'reports', v_report::text,
    jsonb_build_object('target_member_id', t.id, 'notified', n));

  return jsonb_build_object('report_id', v_report, 'member_id', t.id, 'notified', n);
end;
$$;
revoke execute on function public.request_block(uuid, text) from public, anon;
grant execute on function public.request_block(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_role. roles.assign for the role's branch (national and global grants cover every
-- branch). A global-scope role (super_admin, mentor, enforcement_committee) also needs
-- system.config, so a roles.assign holder cannot hand out powers above their own tier.
-- A branch role is only for a member of that branch. Overlapping terms of the same role are refused.
-- ---------------------------------------------------------------------------
create function public.assign_role(
  member_id uuid,
  role_key text,
  branch_id uuid default null,
  starts_on date default null,
  ends_on date default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_scope public.role_scope;
  t record;
  v_start date := coalesce(assign_role.starts_on, today);
  v_id uuid;
begin
  select r.scope into v_scope from public.roles r where r.key = assign_role.role_key;
  if v_scope is null then
    raise exception 'assign_role: unknown role' using errcode = '22023';
  end if;
  if not public.has_permission('roles.assign', assign_role.branch_id) then
    raise exception 'assign_role: roles.assign is required' using errcode = '42501';
  end if;
  if assign_role.member_id = me then
    raise exception 'assign_role: you cannot assign a role to yourself' using errcode = '42501';
  end if;
  if v_scope = 'global' and not public.has_permission('system.config') then
    raise exception 'assign_role: global roles need system.config' using errcode = '42501';
  end if;

  select m.id, m.status, m.branch_id into t from public.members m
  where m.id = assign_role.member_id for update;
  if t.id is null then
    raise exception 'assign_role: unknown member' using errcode = '22023';
  end if;
  if t.status <> 'active' then
    raise exception 'assign_role: only an active member can hold a role' using errcode = '23514';
  end if;
  if v_scope = 'branch' and assign_role.branch_id is not null and assign_role.branch_id <> t.branch_id then
    raise exception 'assign_role: a branch role is only for a member of that branch' using errcode = '23514';
  end if;
  if v_start < today then
    raise exception 'assign_role: starts_on cannot be in the past' using errcode = '22023';
  end if;
  if assign_role.ends_on is not null and assign_role.ends_on < v_start then
    raise exception 'assign_role: ends_on must be on or after starts_on' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.role_assignments ra
    where ra.member_id = t.id
      and ra.role_key = assign_role.role_key
      and ra.branch_id is not distinct from assign_role.branch_id
      and (ra.ends_on is null or ra.ends_on >= v_start)
      and (assign_role.ends_on is null or ra.starts_on <= assign_role.ends_on)
  ) then
    raise exception 'assign_role: the member already holds this role for an overlapping term' using errcode = '23514';
  end if;

  -- role_assignments_check_scope raises 23514 for a missing or superfluous branch_id.
  insert into public.role_assignments (member_id, role_key, branch_id, starts_on, ends_on, assigned_by)
  values (t.id, assign_role.role_key, assign_role.branch_id, v_start, assign_role.ends_on, me)
  returning id into v_id;

  perform public.write_audit('role.assigned', 'role_assignments', v_id::text,
    jsonb_build_object('member_id', t.id, 'role_key', assign_role.role_key, 'branch_id', assign_role.branch_id,
                       'starts_on', v_start, 'ends_on', assign_role.ends_on));

  return jsonb_build_object('assignment_id', v_id, 'member_id', t.id, 'role_key', assign_role.role_key,
                            'branch_id', assign_role.branch_id, 'starts_on', v_start, 'ends_on', assign_role.ends_on);
end;
$$;
revoke execute on function public.assign_role(uuid, text, uuid, date, date) from public, anon;
grant execute on function public.assign_role(uuid, text, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- end_role. ends_on defaults to yesterday (IST), so the role stops counting today; it may not be
-- earlier than that. An assignment that would end before it starts is withdrawn (deleted); the
-- audit row keeps its details. Same permission rule as assign_role.
-- ---------------------------------------------------------------------------
create function public.end_role(assignment_id uuid, ends_on date default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date := coalesce(end_role.ends_on, today - 1);
  a record;
  v_scope public.role_scope;
  v_withdrawn boolean;
begin
  select ra.id, ra.member_id, ra.role_key, ra.branch_id, ra.starts_on, ra.ends_on into a
  from public.role_assignments ra where ra.id = end_role.assignment_id for update;
  if a.id is null then
    raise exception 'end_role: unknown assignment' using errcode = '22023';
  end if;
  select r.scope into v_scope from public.roles r where r.key = a.role_key;
  if not public.has_permission('roles.assign', a.branch_id) then
    raise exception 'end_role: roles.assign is required' using errcode = '42501';
  end if;
  if v_scope = 'global' and not public.has_permission('system.config') then
    raise exception 'end_role: global roles need system.config' using errcode = '42501';
  end if;
  if v_end < today - 1 then
    raise exception 'end_role: ends_on cannot be before yesterday' using errcode = '22023';
  end if;
  if a.ends_on is not null and a.ends_on <= v_end then
    raise exception 'end_role: the assignment already ends by that date' using errcode = '23514';
  end if;
  if a.role_key = 'super_admin' and not public.super_admin_remains(null, a.id) then
    raise exception 'end_role: the last super admin cannot be removed' using errcode = '23514';
  end if;

  v_withdrawn := v_end < a.starts_on;
  if v_withdrawn then
    delete from public.role_assignments ra where ra.id = a.id;
  else
    update public.role_assignments ra set ends_on = v_end where ra.id = a.id;
  end if;

  perform public.write_audit('role.ended', 'role_assignments', a.id::text,
    jsonb_build_object('member_id', a.member_id, 'role_key', a.role_key, 'branch_id', a.branch_id,
                       'starts_on', a.starts_on, 'ends_on', v_end, 'withdrawn', v_withdrawn));

  return jsonb_build_object('assignment_id', a.id, 'ends_on', case when v_withdrawn then null else v_end end,
                            'withdrawn', v_withdrawn);
end;
$$;
revoke execute on function public.end_role(uuid, date) from public, anon;
grant execute on function public.end_role(uuid, date) to authenticated;

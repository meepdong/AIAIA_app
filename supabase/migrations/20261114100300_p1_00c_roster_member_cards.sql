-- P1-00c (part 4): paper-roster import, and member column masking (orchestrator decision 8).
-- Rules: 01-architecture.md 5 and 6.

-- ---------------------------------------------------------------------------
-- Member column masking
-- ---------------------------------------------------------------------------
-- Until now every active member could read every active member's whole members row, including
-- status_reason, approved_by and privacy, and the privacy flags were not applied to profile
-- columns. Members now read each other through member_cards only. Self (members_select_own) and
-- approvers (members_select_approver) keep full rows.
drop policy members_select_active on public.members;

-- A guardian reads their ward's own row (active link only, through is_guardian_of).
create policy members_select_guardian on public.members for select to authenticated
  using (public.is_guardian_of(id));

-- Runs as its owner, so it bypasses members RLS and must filter on its own: active rows only,
-- and only for an active caller (the waiting room). security_barrier keeps a caller's own WHERE
-- clauses (and leaky functions in them) from running before these filters.
-- Profile flags match search_directory: shown unless explicitly false.
create view public.member_cards
with (security_barrier = true)
as
select
  m.id,
  m.full_name,
  m.branch_id,
  m.wing,
  m.member_no,
  case when coalesce(m.privacy ->> 'show_city', 'true') <> 'false' then m.city end as city,
  case when coalesce(m.privacy ->> 'show_occupation', 'true') <> 'false' then m.occupation end as occupation,
  case when coalesce(m.privacy ->> 'show_photo', 'true') <> 'false' then m.photo_path end as photo_path
from public.members m
where m.status = 'active'
  and (select public.is_active());

comment on view public.member_cards is
  'Other members as an active member may see them: no status, approval or privacy columns; city, '
  'occupation and photo masked by members.privacy. Read-only.';

-- A simple view is auto-updatable and would write as its owner, past members RLS: select only.
revoke all on public.member_cards from public, anon, authenticated, service_role;
grant select on public.member_cards to authenticated, service_role;

-- member_status_events_select joined members as the invoker to find the member's branch, so it
-- silently depended on the caller being able to see that members row. A members.manage holder
-- without members.approve never could for non-active members, and after the drop above could not
-- for active ones either. Look the branch up in a definer helper instead.
create function public.can_manage_member(target uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id = target and public.has_permission('members.manage', m.branch_id)
  );
$$;
revoke execute on function public.can_manage_member(uuid) from public, anon;
grant execute on function public.can_manage_member(uuid) to authenticated;

drop policy member_status_events_select on public.member_status_events;
create policy member_status_events_select on public.member_status_events
  for select to authenticated using (
    member_id = (select public.current_member_id())
    or public.can_manage_member(member_id)
  );

-- ---------------------------------------------------------------------------
-- import_roster(rows)
-- ---------------------------------------------------------------------------
-- rows: a JSON array (1-1000) of {branch_id, full_name, phone?, dob?, member_no?, notes?}.
-- The caller needs roster.import for every row's branch, or nothing is written (42501).
-- Phones are normalised (spaces, dashes, brackets dropped) and deduplicated:
--   no roster row with that phone      -> inserted
--   an unclaimed row the caller may import into (roster.import for its branch) -> updated
--   a claimed row, or one in a branch the caller cannot import into          -> skipped
-- Rows without a phone are always inserted. Returns {inserted, updated, skipped}.
create function public.import_roster(rows jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  r jsonb;
  i integer := 0;
  b uuid;
  nm text;
  ph text;
  d date;
  mno text;
  nt text;
  ex_id uuid;
  ex_branch uuid;
  ex_claimed uuid;
  n_ins integer := 0;
  n_upd integer := 0;
  n_skip integer := 0;
  branches uuid[];
begin
  if import_roster.rows is null or jsonb_typeof(import_roster.rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(import_roster.rows) < 1 or jsonb_array_length(import_roster.rows) > 1000 then
    raise exception 'rows must hold 1 to 1000 entries' using errcode = '22023';
  end if;

  -- Validate every row and check the permission for every branch before writing anything.
  for r in select value from jsonb_array_elements(import_roster.rows) loop
    i := i + 1;
    if jsonb_typeof(r) <> 'object' then
      raise exception 'row % is not an object', i using errcode = '22023';
    end if;
    begin
      b := (r ->> 'branch_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'row % has an invalid branch_id', i using errcode = '22023';
    end;
    if b is null then
      raise exception 'row % has no branch_id', i using errcode = '22023';
    end if;
    if not public.has_permission('roster.import', b) then
      raise exception 'roster.import is required for every row''s branch' using errcode = '42501';
    end if;
    nm := btrim(coalesce(r ->> 'full_name', ''));
    if length(nm) not between 1 and 120 then
      raise exception 'row % needs a full_name of 1 to 120 characters', i using errcode = '22023';
    end if;
    ph := nullif(regexp_replace(coalesce(r ->> 'phone', ''), '[[:space:]()-]', '', 'g'), '');
    if ph is not null and ph !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'row % has a phone that is not in +<country><number> form', i using errcode = '22023';
    end if;
    begin
      d := nullif(r ->> 'dob', '')::date;
    exception when others then
      raise exception 'row % has an invalid dob', i using errcode = '22023';
    end;
    if d is not null and (d > (now() at time zone 'Asia/Kolkata')::date or d < date '1900-01-01') then
      raise exception 'row % has a dob outside 1900 to today', i using errcode = '22023';
    end if;
    if length(coalesce(r ->> 'notes', '')) > 1000 then
      raise exception 'row % has notes over 1000 characters', i using errcode = '22023';
    end if;
    if length(coalesce(r ->> 'member_no', '')) > 50 then
      raise exception 'row % has a member_no over 50 characters', i using errcode = '22023';
    end if;
  end loop;

  for r in select value from jsonb_array_elements(import_roster.rows) loop
    b := (r ->> 'branch_id')::uuid;
    nm := btrim(r ->> 'full_name');
    ph := nullif(regexp_replace(coalesce(r ->> 'phone', ''), '[[:space:]()-]', '', 'g'), '');
    d := nullif(r ->> 'dob', '')::date;
    mno := nullif(btrim(coalesce(r ->> 'member_no', '')), '');
    nt := nullif(btrim(coalesce(r ->> 'notes', '')), '');

    ex_id := null;
    ex_branch := null;
    ex_claimed := null;
    if ph is not null then
      select e.id, e.branch_id, e.claimed_member_id into ex_id, ex_branch, ex_claimed
      from public.roster_entries e where e.phone = ph
      for update;
    end if;

    if ex_id is null then
      insert into public.roster_entries (branch_id, full_name, phone, dob, member_no, notes, imported_by)
      values (b, nm, ph, d, mno, nt, me);
      n_ins := n_ins + 1;
    elsif ex_claimed is null and public.has_permission('roster.import', ex_branch) then
      update public.roster_entries e
      set branch_id = b, full_name = nm, dob = coalesce(d, e.dob),
          member_no = coalesce(mno, e.member_no), notes = coalesce(nt, e.notes),
          imported_by = me, imported_at = now()
      where e.id = ex_id;
      n_upd := n_upd + 1;
    else
      n_skip := n_skip + 1;
    end if;
  end loop;

  select array_agg(distinct (value ->> 'branch_id')::uuid) into branches from jsonb_array_elements(import_roster.rows);
  -- Counts and branches only: never phones, names or DOBs.
  perform public.write_audit('roster.import', 'roster_entries', null,
    jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip, 'branch_ids', to_jsonb(branches)));

  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip);
end;
$$;
revoke execute on function public.import_roster(jsonb) from public, anon;
grant execute on function public.import_roster(jsonb) to authenticated;

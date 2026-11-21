-- P1-07b delegate passes.
--   my_passes()            the passes the caller may hold: their own and their active wards'.
--                          The member-pass Edge Function signs exactly these rows, as the caller.
--   reissue_pass(member)   bumps members.pass_version, which revokes every printed or cached copy
--                          of the old pass (scanners compare pass_version with the event pack).

-- ---------------------------------------------------------------------------
-- my_passes: the caller's own row while active, plus each ward the caller is an active guardian
-- of (is_guardian_of: active caller, link with ended_at IS NULL), when the ward is active too.
-- Pending, rejected, suspended and deleted callers get no rows (the waiting room). Read-only and
-- returns no contact details, so no audit row.
-- ---------------------------------------------------------------------------
create function public.my_passes()
returns table (
  member_id uuid,
  full_name text,
  branch_name text,
  pass_version integer,
  is_self boolean
)
language sql stable security definer
set search_path = ''
as $$
  select p.member_id, p.full_name, p.branch_name, p.pass_version, p.is_self
  from (
    select m.id as member_id, m.full_name, b.name as branch_name, m.pass_version, true as is_self
    from public.members m
    join public.branches b on b.id = m.branch_id
    where m.user_id = (select auth.uid())
      and m.status = 'active'
    union all
    select d.id, d.full_name, b.name, d.pass_version, false
    from public.member_guardians g
    join public.members d on d.id = g.member_id
    join public.branches b on b.id = d.branch_id
    where g.guardian_member_id = public.current_member_id()
      -- Redundant with is_guardian_of's own ended_at check; kept as defence in depth.
      and g.ended_at is null
      and public.is_guardian_of(d.id)
      and d.status = 'active'
  ) p
  order by p.is_self desc, p.full_name, p.member_id;
$$;
revoke execute on function public.my_passes() from public, anon;
grant execute on function public.my_passes() to authenticated;

-- ---------------------------------------------------------------------------
-- reissue_pass: an officer with members.manage for the member's branch (national and global
-- grants cover every branch; super-admin grants only with a step-up, through has_permission)
-- invalidates a lost pass. Returns the new pass_version. An unknown id and a refused caller get
-- the same error, so the RPC does not reveal which ids exist.
-- ---------------------------------------------------------------------------
create function public.reissue_pass(member_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  m public.members%rowtype;
  next_version integer;
begin
  if reissue_pass.member_id is null then
    raise exception 'member_id is required' using errcode = '22023';
  end if;

  select * into m from public.members x where x.id = reissue_pass.member_id for update;
  if not found or not public.has_permission('members.manage', m.branch_id) then
    raise exception 'not allowed to reissue this pass' using errcode = '42501';
  end if;
  if m.status = 'deleted' then
    raise exception 'a deleted member has no pass' using errcode = '22023';
  end if;

  update public.members x
  set pass_version = x.pass_version + 1
  where x.id = m.id
  returning x.pass_version into next_version;

  perform public.write_audit('member.pass_reissued', 'members', m.id::text,
    jsonb_build_object('from_version', m.pass_version, 'to_version', next_version));
  return next_version;
end;
$$;
revoke execute on function public.reissue_pass(uuid) from public, anon;
grant execute on function public.reissue_pass(uuid) to authenticated;

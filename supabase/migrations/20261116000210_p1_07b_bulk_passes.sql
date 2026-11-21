-- P1-07b bulk pass printing (Must 3).
--   bulk_passes(branch_id, event_id)  the passes an officer may print on an A4 sheet, for exactly one
--                                     scope: a branch's active members, or an event's active
--                                     registrants. The member-pass Edge Function calls it as the
--                                     caller and signs exactly these rows, so the server (never the
--                                     client) decides whose passes are signed.
--
-- Who may print:
--   branch scope  has_permission('members.manage', branch): the permission that already governs a
--                 member's pass (reissue_pass). National and global grants cover every branch;
--                 super-admin grants count only with a step-up (has_permission applies both).
--   event scope   is_event_officer(event): events.branch for the event's branch, or events.national
--                 for a national event. Listed event staff (check_in etc.) are not enough: they scan
--                 passes, they do not mint sheets of them.
-- Errors: 42501 for "not allowed" and "no such scope" alike (ids cannot be probed), 22023 for a bad
-- argument, 54000 when the scope holds more than 500 passes (split the job).

create function public.bulk_passes(branch_id uuid default null, event_id uuid default null)
returns table (
  member_id uuid,
  full_name text,
  branch_name text,
  pass_version integer
)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  max_rows constant integer := 500;
  n integer;
begin
  if (bulk_passes.branch_id is null) = (bulk_passes.event_id is null) then
    raise exception 'give exactly one of branch_id or event_id' using errcode = '22023';
  end if;

  if bulk_passes.branch_id is not null then
    if not public.has_permission('members.manage', bulk_passes.branch_id) then
      raise exception 'not allowed to print passes for this branch' using errcode = '42501';
    end if;

    return query
      select m.id, m.full_name, b.name, m.pass_version
      from public.members m
      join public.branches b on b.id = m.branch_id
      where m.branch_id = bulk_passes.branch_id
        and m.status = 'active'
      order by m.full_name, m.id
      limit max_rows + 1;
  else
    if not public.is_event_officer(bulk_passes.event_id) then
      raise exception 'not allowed to print passes for this event' using errcode = '42501';
    end if;

    -- Deliberate: every going registrant, other branches' included (owner decision 2026-11-21).
    return query
      select m.id, m.full_name, b.name, m.pass_version
      from public.rsvps r
      join public.members m on m.id = r.member_id
      join public.branches b on b.id = m.branch_id
      where r.event_id = bulk_passes.event_id
        and r.status = 'going'
        and m.status = 'active'
      order by b.name, m.full_name, m.id
      limit max_rows + 1;
  end if;

  -- The rows above are only returned when the function ends normally, so raising here sends none.
  get diagnostics n = row_count;
  if n > max_rows then
    raise exception 'more than % passes in one batch', max_rows using errcode = '54000';
  end if;

  perform public.write_audit(
    'member.passes_bulk',
    case when bulk_passes.branch_id is not null then 'branches' else 'events' end,
    coalesce(bulk_passes.branch_id, bulk_passes.event_id)::text,
    jsonb_build_object(
      'scope', case when bulk_passes.branch_id is not null then 'branch' else 'event' end,
      'count', n
    )
  );
end;
$$;
revoke execute on function public.bulk_passes(uuid, uuid) from public, anon;
grant execute on function public.bulk_passes(uuid, uuid) to authenticated;

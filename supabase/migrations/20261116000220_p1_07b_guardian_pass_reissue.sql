-- P1-07b (owner decision m3, 2026-11-21): when a guardian link is ended by removal, the ward's pass
-- is reissued (members.pass_version + 1), so a copy the former guardian kept (printed, cached,
-- screenshot) scans as `stale`. The 18th-birthday handover does not reissue: the ward keeps using
-- the same pass.
--
-- Removal is told apart from the handover by member_guardians.ended_reason, which every code path
-- that ends a link sets in the same UPDATE (a check constraint ties it to ended_at). Handover
-- reasons are 'turned_18' (daily_age_transitions) and 'claimed' (graduate_dependent, which ends
-- links only for an adult ward). Every other reason, today 'removed' and any reason added later,
-- reissues: unknown means revoke (fail closed). A reason column was chosen over a GUC set by the
-- handover function, because a GUC is per transaction, is set by convention only, and a forgotten
-- or leaked setting would silently skip or force the bump.

create function public.reissue_ward_pass_on_guardian_removal()
returns trigger
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.members m
  set pass_version = m.pass_version + 1
  where m.id = new.member_id;

  perform public.write_audit('member.pass_reissued', 'members', new.member_id::text,
    jsonb_build_object('reason', 'guardian_link_ended', 'ended_reason', new.ended_reason,
                       'guardian_member_id', new.guardian_member_id));
  return null;
end;
$$;
revoke execute on function public.reissue_ward_pass_on_guardian_removal() from public, anon, authenticated;

create trigger member_guardians_reissue_ward_pass
  after update of ended_at on public.member_guardians
  for each row
  when (old.ended_at is null and new.ended_at is not null
        and new.ended_reason is distinct from 'turned_18'
        and new.ended_reason is distinct from 'claimed')
  execute function public.reissue_ward_pass_on_guardian_removal();

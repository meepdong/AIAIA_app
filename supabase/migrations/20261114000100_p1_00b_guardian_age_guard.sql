-- P1-00b: age guard on the guardian path (01-architecture.md 5.10 and 5.11).
-- Guardian access must stop at the ward's 18th birthday even if the nightly daily_age_transitions
-- job has not run yet. A dependent without their own login may still be managed for
-- app_settings.adult_handover_grace_days after their 18th birthday; after that, guardian reads and
-- writes are both blocked until the member claims the profile.
-- A missing or non-numeric grace setting counts as 0 days, and a ward with no member_private row
-- (no DOB on record) gives no access: both fail closed.

create or replace function public.is_guardian_of(ward uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active() and exists (
    select 1
    from public.member_guardians g
    join public.members w on w.id = g.member_id
    join public.member_private wp on wp.member_id = g.member_id
    where g.member_id = ward
      and g.guardian_member_id = public.current_member_id()
      and g.ended_at is null
      and (
        -- still a minor today (Asia/Kolkata)
        wp.dob > ((now() at time zone 'Asia/Kolkata')::date - interval '18 years')::date
        -- or an adult dependent without a login, inside the handover grace period
        or (
          w.user_id is null
          and (wp.dob + interval '18 years')::date + coalesce(
            (select case when jsonb_typeof(s.value) = 'number' then greatest((s.value)::text::numeric::int, 0) end
             from public.app_settings s
             where s.key = 'adult_handover_grace_days'),
            0
          ) > (now() at time zone 'Asia/Kolkata')::date
        )
      )
  );
$$;

revoke execute on function public.is_guardian_of(uuid) from public, anon;
grant execute on function public.is_guardian_of(uuid) to authenticated;

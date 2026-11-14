-- P1-01: a member must not be able to change their own login phone through Supabase Auth.
--
-- auth.updateUser({ phone }) stores the new number in auth.users.phone_change and, once the OTP is
-- confirmed, moves it into auth.users.phone. That bypasses the support flow (members.change_phone)
-- and with it the revocation of trusted devices and step-ups (architecture 5.6). This trigger
-- refuses both writes unless the transaction has opted in, which only a security definer RPC can do:
--
--   perform set_config('aiaia.allow_phone_change', 'on', true);   -- transaction-local
--
-- (the future members.change_phone RPC). Setting a phone on an account that has none (first
-- sign-in creates the user with its phone via INSERT) is not an update of an existing number and
-- stays allowed. The service role's admin API is blocked too, by design: it has to go through the RPC.

create function public.guard_auth_phone_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('aiaia.allow_phone_change', true), '') = 'on' then
    return new;
  end if;

  if coalesce(old.phone, '') <> '' and new.phone is distinct from old.phone then
    raise exception 'phone number changes go through the support flow (members.change_phone)'
      using errcode = '42501';
  end if;

  if coalesce(new.phone_change, '') <> '' and new.phone_change is distinct from old.phone_change then
    raise exception 'phone number changes go through the support flow (members.change_phone)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_auth_phone_change() from public, anon, authenticated;

create trigger guard_phone_change
  before update of phone, phone_change on auth.users
  for each row
  execute function public.guard_auth_phone_change();

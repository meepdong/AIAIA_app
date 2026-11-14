-- P1-01: atomic OTP send throttle (security review finding M3).
--
-- auth-send-otp used to read the per-number send counts, check them and insert in separate
-- requests, so N parallel sign-ins for one number all read "fewer than 5" and all got sent.
-- otp_throttle_take does the check and the insert under a per-hash advisory lock, in one call.
--
-- Limits match the Edge Function (handler.ts): 5 sends per hour and 10 per day per phone hash.
-- A send is counted before it is attempted, so a failing provider cannot be used to burn through
-- messages. The opportunistic purge of old rows stays in the Edge Function (direct delete).

create function public.otp_throttle_take(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_hour_count integer;
  v_day_count integer;
  v_hour_retry timestamptz;
  v_day_retry timestamptz;
begin
  -- Same bounds as the table's check constraint; refuse early with a clear error.
  if p_hash is null or pg_catalog.length(p_hash) < 16 or pg_catalog.length(p_hash) > 128 then
    raise exception 'otp_throttle_take: invalid phone hash' using errcode = '22023';
  end if;

  -- Serialise every take for this number until the transaction ends, so a concurrent call
  -- counts this call's row before deciding.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('otp_throttle:' || p_hash, 0));

  select count(*) filter (where t.sent_at > v_now - interval '1 hour'),
         count(*)
    into v_hour_count, v_day_count
    from public.otp_throttle t
   where t.phone_hash = p_hash
     and t.sent_at > v_now - interval '1 day';

  if v_hour_count >= 5 or v_day_count >= 10 then
    -- Retry when the oldest send that still counts against the limit ages out.
    if v_hour_count >= 5 then
      select t.sent_at + interval '1 hour' into v_hour_retry
        from public.otp_throttle t
       where t.phone_hash = p_hash and t.sent_at > v_now - interval '1 hour'
       order by t.sent_at desc
      offset 4 limit 1;
    end if;
    if v_day_count >= 10 then
      select t.sent_at + interval '1 day' into v_day_retry
        from public.otp_throttle t
       where t.phone_hash = p_hash and t.sent_at > v_now - interval '1 day'
       order by t.sent_at desc
      offset 9 limit 1;
    end if;
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retry_at', greatest(v_hour_retry, v_day_retry));
  end if;

  insert into public.otp_throttle (phone_hash, sent_at) values (p_hash, v_now);
  return pg_catalog.jsonb_build_object('allowed', true);
end;
$$;

comment on function public.otp_throttle_take(text) is
  'Atomic OTP send throttle for auth-send-otp (service role only). Counts and records one send for an HMAC phone hash, or refuses with retry_at when 5/hour or 10/day is reached.';

revoke execute on function public.otp_throttle_take(text) from public, anon, authenticated;
grant execute on function public.otp_throttle_take(text) to service_role;

-- The function is now the only way a send is recorded. The service role keeps select and delete
-- for the Edge Function's purge (a delete with a where clause needs select on the column).
revoke insert, update on public.otp_throttle from service_role;

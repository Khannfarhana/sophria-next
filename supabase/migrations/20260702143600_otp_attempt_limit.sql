-- Pickup-code retry limiting: 5 wrong attempts locks the code for 10 minutes
-- (self-healing — no admin reset needed). The counter must survive a failed
-- attempt, so the function RETURNS a result instead of raising on soft
-- failures (RAISE would roll back the increment in the same transaction).
-- Hard failures (not the driver / wrong state / no code) still raise.
--
-- otp_attempts / otp_last_attempt_at are intentionally NOT in the
-- column-level SELECT grant on bookings — clients never see them.

alter table public.bookings
  add column if not exists otp_attempts integer not null default 0,
  add column if not exists otp_last_attempt_at timestamptz;

comment on column public.bookings.otp_attempts is 'Consecutive failed pickup-code attempts (reset on success or after the lockout window)';
comment on column public.bookings.otp_last_attempt_at is 'Time of the most recent failed pickup-code attempt';

-- Return type changes (void -> jsonb): must drop first.
drop function if exists public.start_ride_with_otp(uuid, text);

create function public.start_ride_with_otp(_booking_id uuid, _otp text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _driver_id uuid;
  _row record;
  _attempts integer;
  _max constant integer := 5;
  _window constant interval := interval '10 minutes';
begin
  select id into _driver_id from public.drivers where user_id = auth.uid();
  if _driver_id is null then
    raise exception 'Not a driver';
  end if;

  select status, start_otp, driver_id, otp_attempts, otp_last_attempt_at
  into _row from public.bookings where id = _booking_id;

  if _row is null or _row.driver_id is distinct from _driver_id then
    raise exception 'Booking not assigned to current driver';
  end if;
  if _row.status not in ('accepted', 'confirmed', 'driver_assigned') then
    raise exception 'Ride cannot be started from its current state';
  end if;
  if _row.start_otp is null then
    raise exception 'No pickup code set for this ride';
  end if;

  -- Expired lockout window ⇒ counter starts fresh.
  _attempts := case
    when _row.otp_last_attempt_at is null or _row.otp_last_attempt_at < now() - _window then 0
    else _row.otp_attempts
  end;

  if _attempts >= _max then
    return jsonb_build_object('ok', false, 'error',
      'Too many incorrect attempts. Try again in about 10 minutes.');
  end if;

  if btrim(_otp) is distinct from _row.start_otp then
    _attempts := _attempts + 1;
    update public.bookings
    set otp_attempts = _attempts, otp_last_attempt_at = now()
    where id = _booking_id;
    return jsonb_build_object('ok', false, 'error',
      case when _attempts >= _max
        then 'Too many incorrect attempts. Try again in about 10 minutes.'
        else format('Incorrect pickup code — %s attempt%s remaining.',
                    _max - _attempts, case when _max - _attempts = 1 then '' else 's' end)
      end);
  end if;

  update public.bookings
  set status = 'in_progress', otp_attempts = 0, otp_last_attempt_at = null, updated_at = now()
  where id = _booking_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.start_ride_with_otp(uuid, text) to authenticated;

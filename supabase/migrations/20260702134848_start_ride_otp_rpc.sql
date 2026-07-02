-- Harden the pickup-OTP flow.
--
-- 1) start_ride_with_otp: atomic SECURITY DEFINER start — verifies the caller
--    is the assigned driver, the ride is in a startable state, and the OTP
--    matches, then flips to in_progress. Replaces client-side verification.
--
-- 2) Column privileges: drivers could previously read bookings.start_otp via
--    the REST API (RLS is row-level only). Re-grant SELECT column-by-column,
--    excluding start_otp, so the code can only be obtained from the customer.
--    Customers read their own code through a service-role server action.
--    ⚠ When adding new columns to public.bookings, extend this grant list.

create or replace function public.start_ride_with_otp(_booking_id uuid, _otp text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _driver_id uuid;
  _row record;
begin
  select id into _driver_id from public.drivers where user_id = auth.uid();
  if _driver_id is null then
    raise exception 'Not a driver';
  end if;

  select status, start_otp, driver_id into _row
  from public.bookings where id = _booking_id;

  if _row is null or _row.driver_id is distinct from _driver_id then
    raise exception 'Booking not assigned to current driver';
  end if;
  if _row.status not in ('accepted', 'confirmed', 'driver_assigned') then
    raise exception 'Ride cannot be started from its current state';
  end if;
  if _row.start_otp is null then
    raise exception 'No pickup code set for this ride';
  end if;
  if btrim(_otp) is distinct from _row.start_otp then
    raise exception 'Incorrect pickup code';
  end if;

  update public.bookings
  set status = 'in_progress', updated_at = now()
  where id = _booking_id;
end;
$$;

grant execute on function public.start_ride_with_otp(uuid, text) to authenticated;

-- Column-level SELECT: everything except start_otp.
revoke select on table public.bookings from authenticated;
grant select (
  id, reference, customer_id, driver_id, vehicle_id, trip_type,
  pickup_location, dropoff_location, pickup_datetime, duration_hours,
  flight_number, passenger_count, luggage_count, fare_estimate,
  passenger_name, passenger_phone, special_requests, status, payment_status,
  stripe_payment_id, rejection_reason, rejection_notes, created_at, updated_at,
  pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min
) on public.bookings to authenticated;

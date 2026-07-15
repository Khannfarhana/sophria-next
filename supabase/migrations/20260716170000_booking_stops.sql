-- Intermediate stops (16 Jul 2026).
--
-- "And we need to leave option to add upto 5 stops" (client, 14 Jul). There was
-- no stop capability at all: two address fields, no column, and Mapbox routing
-- between exactly two points — while /pricing and the FAQ already advertised
-- multi-stop trips and "$10 per 10 minutes" for requested stops.
--
-- Shape: ordered JSON array, at most MAX_STOPS (5) entries —
--   [{"address": "Yorkdale Mall, Toronto", "lat": 43.72, "lng": -79.45}, ...]
-- lat/lng may be null when the passenger typed an address Mapbox couldn't
-- resolve; those stops still print on the driver's itinerary, they just can't
-- be routed through.
--
-- jsonb rather than a child table: stops are always read and written whole with
-- their booking, are capped at five, and are never queried independently.

alter table public.bookings
  add column if not exists stops jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.bookings
    add constraint bookings_stops_shape
    check (
      jsonb_typeof(stops) = 'array'
      and jsonb_array_length(stops) <= 5
    );
exception when duplicate_object then null; end $$;

comment on column public.bookings.stops is
  'Ordered intermediate stops, max 5: [{address, lat, lng}]. Routed through in order; lat/lng null when unresolved.';

-- bookings SELECT is granted column-by-column (20260702134848).
grant select (stops) on public.bookings to authenticated;

-- Guard stops alongside the money columns. Stops change the routed distance and
-- therefore the fare, so letting a customer PATCH stops onto a booking whose
-- fare_estimate is already frozen would hand them extra stops for free.
create or replace function public.prevent_booking_payout_tamper()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = ''
     or coalesce((current_setting('request.jwt.claims', true)::json ->> 'role'), '') = 'service_role'
     or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if new.driver_payout is distinct from old.driver_payout
     or new.tip is distinct from old.tip then
    raise exception 'driver_payout and tip can only be set by an administrator';
  end if;

  if new.fare_estimate is distinct from old.fare_estimate
     or new.base_fare is distinct from old.base_fare
     or new.markup_amount is distinct from old.markup_amount
     or new.airport_fee is distinct from old.airport_fee
     or new.tax_amount is distinct from old.tax_amount
     or new.stops is distinct from old.stops then
    raise exception 'Fare amounts and stops can only be set by an administrator';
  end if;

  if new.cancellation_penalty_rate is distinct from old.cancellation_penalty_rate
     or new.cancellation_penalty is distinct from old.cancellation_penalty
     or new.refund_amount is distinct from old.refund_amount
     or new.stripe_refund_id is distinct from old.stripe_refund_id then
    raise exception 'Cancellation amounts can only be set by an administrator';
  end if;

  return new;
end;
$$;

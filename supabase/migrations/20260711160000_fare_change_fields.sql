-- Admin fare adjustments are communicated inside the payment-request email
-- (no separate fare email), so the change must persist on the booking:
--   * previous_fare — the fare before the most recent admin change
--   * fare_change_reason — shown to the customer in the email
-- Extend the column-level SELECT grant per the warning in 20260702134848.

alter table public.bookings
  add column if not exists previous_fare numeric;

alter table public.bookings
  add column if not exists fare_change_reason text;

comment on column public.bookings.previous_fare is
  'Fare before the most recent admin fare change (null if never changed).';
comment on column public.bookings.fare_change_reason is
  'Admin-entered reason for the most recent fare change; included in the payment-request email.';

grant select (previous_fare, fare_change_reason) on public.bookings to authenticated;

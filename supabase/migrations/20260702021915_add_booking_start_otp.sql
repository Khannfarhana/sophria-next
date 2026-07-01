-- Pickup verification code. Generated at booking, shown to the customer, and
-- required (verified server-side) before a driver can start the ride.

alter table public.bookings
  add column if not exists start_otp text;

comment on column public.bookings.start_otp is 'Pickup OTP the customer shares with the driver to start the ride';

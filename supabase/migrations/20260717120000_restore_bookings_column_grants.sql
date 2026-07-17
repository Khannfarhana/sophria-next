-- Restore the column-level SELECT scheme on bookings (17 Jul 2026).
--
-- 20260702134848 established it: "Column-level SELECT: everything except
-- start_otp", by revoking table-level SELECT and re-granting an explicit list.
-- That migration ran (start_ride_with_otp exists), but the live database now
-- shows table-level SELECT granted back to authenticated:
--
--   relacl: {postgres=arwdDxtm/postgres,anon=arw/postgres,
--            authenticated=arw/postgres,service_role=arwdDxtm/postgres}
--                          ^ r = SELECT on EVERY column
--
-- A table-level grant silently overrides column-level grants — Postgres checks
-- the table privilege first and never consults pg_attribute.attacl. So every
-- column-by-column grant written since (driver_payout, tip, the fare
-- breakdown) has been decorative, and start_otp — which was deliberately
-- never granted, and still has no column ACL of its own — is readable.
--
-- WHY THIS MATTERS: the bookings SELECT policy grants the assigned driver
-- access to their ride's row:
--
--   USING (auth.uid() = customer_id
--          OR EXISTS (SELECT 1 FROM drivers d
--                     WHERE d.id = bookings.driver_id AND d.user_id = auth.uid())
--          OR has_role(auth.uid(), 'admin'))
--
-- RLS is row-level and cannot hide a column. So with table-level SELECT back,
-- a driver can read start_otp for their own assigned ride straight from
-- PostgREST and start the ride without the passenger present — which is the
-- one thing the OTP exists to prevent. driver/page.tsx's select comment
-- ("never expose start_otp ... to the driver's client") describes an
-- application-layer choice the database was supposed to enforce, and doesn't.
--
-- Nothing legitimate loses access: the customer reads their code through
-- getBookingOtpAction, which uses the SERVICE ROLE (unaffected by grants to
-- `authenticated`) after checking customer_id, and the driver submits it to
-- the start_ride_with_otp SECURITY DEFINER RPC, which compares it server-side.
-- No client query selects start_otp, otp_attempts or otp_last_attempt_at, and
-- no query on bookings uses select("*") — all 16 call sites name their columns
-- — so re-revoking cannot break a read.
--
-- ON THE CAUSE: unknown, and not in this repo — neither seed.sql nor
-- db-migrate-seed.mjs grants anything, and no migration re-grants at table
-- level. Note there is no CREATE TABLE bookings here either: the table is
-- managed outside these migrations, and Supabase's default privileges for
-- schema public grant all to anon/authenticated on table creation. A dashboard
-- edit or a restore would reapply them. If `relacl` shows `authenticated=arw`
-- again, that is the cause — this migration is idempotent, so re-run it.

revoke select on table public.bookings from authenticated;

-- Explicitly withheld, and absent from this list on purpose:
--   start_otp            — the passenger's proof of presence
--   otp_attempts         — rate-limiter state (20260702143600)
--   otp_last_attempt_at  — rate-limiter state
grant select (
  id, reference, customer_id, driver_id, vehicle_id, pickup_location,
  dropoff_location, pickup_datetime, status, fare_estimate,
  payment_status, stripe_payment_id, passenger_name, passenger_phone,
  special_requests, created_at, updated_at, rejection_reason,
  rejection_notes, trip_type, duration_hours, flight_number,
  passenger_count, luggage_count, pickup_lat, pickup_lng, dropoff_lat,
  dropoff_lng, distance_km, duration_min, driver_payout, previous_fare,
  fare_change_reason, tip, base_fare, markup_amount, airport_fee,
  tax_amount, cancelled_at, cancellation_penalty_rate,
  cancellation_penalty, refund_amount, stripe_refund_id, stops,
  authorized_at, captured_at, auth_expires_at
) on public.bookings to authenticated;

-- anon holds arw on bookings from the same default-privileges grant. Today RLS
-- saves it — every policy on the table names `authenticated`, so an anonymous
-- caller matches none and reads nothing. That is one forgotten `to anon, ...`
-- on a future policy away from being a full public dump of every passenger's
-- name, phone and itinerary. bookings is never anonymously readable or
-- writable, so take the privileges away rather than keep relying on RLS to be
-- the only thing standing there.
revoke select, insert, update on table public.bookings from anon;

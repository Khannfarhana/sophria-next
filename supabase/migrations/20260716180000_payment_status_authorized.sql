-- Add 'authorized' to payment_status (16 Jul 2026).
--
-- Client direction (14 Jul): "in payment we need to hold the amount and after
-- completing the ride we must charge". Payment today is captured the instant
-- the customer pays, so the business holds the passenger's money for a ride
-- that hasn't happened yet.
--
-- 'authorized' means the funds are HELD on the card but not taken: the booking
-- is secured and a driver can be assigned, but nothing has been charged.
--   pending -> authorized -> paid        (captured when the ride completes)
--   pending -> authorized -> cancelled   (hold released, or partially captured
--                                         as a cancellation fee)
--
-- This migration is deliberately alone in its file. Postgres allows ALTER TYPE
-- ADD VALUE inside a transaction, but the new value cannot be USED until that
-- transaction commits — and the CLI runs each migration file as one
-- transaction. Anything referencing 'authorized' must live in a later file.

alter type public.payment_status add value if not exists 'authorized' before 'paid';

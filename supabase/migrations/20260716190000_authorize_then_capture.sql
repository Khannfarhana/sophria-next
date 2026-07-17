-- Authorization/capture timestamps (16 Jul 2026). Separate file from the enum
-- value it complements — see 20260716180000 for why.
--
-- THE CONSTRAINT THAT SHAPES THIS: a card authorization is not open-ended.
-- Stripe holds one for roughly 7 days (card-network dependent — some issuers
-- release sooner), after which the hold lapses and capture fails. A limousine
-- business takes wedding and prom bookings months out, so "hold at booking,
-- capture after the ride" cannot apply to every booking. Bookings further out
-- than AUTH_HOLD_WINDOW_DAYS (src/lib/payments.ts) are charged up front, as
-- they are today, and told so at checkout.
--
-- Cancelling an authorized booking does not need a refund at all: an uncaptured
-- authorization can be partially captured, so the cancellation fee is taken
-- from the hold and the remainder released immediately — no 5-10 day wait.

alter table public.bookings
  add column if not exists authorized_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists auth_expires_at timestamptz;

comment on column public.bookings.authorized_at is
  'When funds were held on the card. Nothing is charged at this point.';
comment on column public.bookings.captured_at is
  'When the held funds were actually taken — set on ride completion.';
comment on column public.bookings.auth_expires_at is
  'Best-effort estimate of when the hold lapses (~7 days). Used to flag bookings whose authorization will not survive to the pickup date.';

-- bookings SELECT is granted column-by-column (20260702134848).
grant select (authorized_at, captured_at, auth_expires_at) on public.bookings to authenticated;

-- Drivers can be dispatched against held funds, not just captured ones —
-- otherwise nothing would ever be assignable under the new flow.
-- assignDriverAction enforces this in code; this comment records the intent.

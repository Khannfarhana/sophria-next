-- Cancellation penalties and refunds (16 Jul 2026).
--
-- cancelBookingAction only ever flipped status to 'cancelled'. It never touched
-- payment_status and never refunded: a customer who had paid could cancel and
-- the money simply stayed captured, while the FAQ advertised a tiered refund
-- policy. There was no refund code in the app at all. These columns record what
-- was decided and returned, so a refund can be reconciled against Stripe.
--
-- Ladder (client, 14 Jul), applied to the taxed fare — see src/lib/cancellation.ts:
--   >12h before pickup   free
--   <=12h                25%
--   <=6h                 50%
--   <=15min              75%
--   at/after pickup     100%
-- The tip is always refunded in full regardless of tier.

alter table public.bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_penalty_rate numeric,
  add column if not exists cancellation_penalty numeric,
  add column if not exists refund_amount numeric,
  add column if not exists stripe_refund_id text;

do $$ begin
  alter table public.bookings
    add constraint bookings_cancellation_amounts_valid
    check (
      (cancellation_penalty_rate is null or (cancellation_penalty_rate >= 0 and cancellation_penalty_rate <= 1))
      and (cancellation_penalty is null or cancellation_penalty >= 0)
      and (refund_amount is null or refund_amount >= 0)
    );
exception when duplicate_object then null; end $$;

comment on column public.bookings.cancelled_at is
  'When the customer cancelled — the instant the penalty tier was resolved against.';
comment on column public.bookings.cancellation_penalty_rate is
  'Penalty fraction applied at cancellation (0-1), snapshotted from the ladder.';
comment on column public.bookings.cancellation_penalty is
  'Amount (CAD) kept as a cancellation fee: (fare_estimate + tax_amount) * rate.';
comment on column public.bookings.refund_amount is
  'Amount (CAD) returned to the customer. Includes the full tip, always.';
comment on column public.bookings.stripe_refund_id is
  'Stripe refund id (re_...), for reconciliation. Null when no refund was due.';

-- bookings SELECT is granted column-by-column (20260702134848).
grant select (cancelled_at, cancellation_penalty_rate, cancellation_penalty, refund_amount)
  on public.bookings to authenticated;
-- stripe_refund_id is deliberately NOT granted: it is reconciliation data, and
-- stripe_payment_id is not exposed to clients either.

-- Guard the new money columns the same way as the rest: authenticated holds
-- table-level UPDATE, so without this a customer could self-declare a refund.
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
     or new.tax_amount is distinct from old.tax_amount then
    raise exception 'Fare amounts can only be set by an administrator';
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

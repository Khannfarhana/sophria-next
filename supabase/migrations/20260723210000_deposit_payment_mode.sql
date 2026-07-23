-- Deposit payment mode (23 Jul 2026).
--
-- Customers can now secure a confirmed booking two ways:
--   full    — the existing flow: whole fare online (held ≤6 days out,
--             charged up front beyond the hold window).
--   deposit — pay ONLY SophRia's share online now (commission + airport fee
--             + HST); the chauffeur's share (balance_due) is settled later,
--             in cash at the ride or online from the dashboard.
--
-- The split is deliberate: everything the platform must remit or keep —
-- commission, GTAA fee, HST — is collected online and never rides in cash,
-- while balance_due equals the driver's payout exactly, so a cash ride needs
-- no driver-owes-platform settlement afterwards: the driver keeps what they
-- collect, the platform already has the rest.
--
--   deposit_amount = fare + HST − balance_due
--   balance_due    = (fare − airport_fee) × default driver share
--
-- payment_status semantics are unchanged: 'paid' means "funds secured for
-- dispatch" — for a deposit booking that is the deposit landing. The balance
-- lifecycle lives in balance_due / balance_paid_at / balance_method.

alter table public.bookings
  add column if not exists payment_mode text not null default 'full',
  add column if not exists deposit_amount numeric,
  add column if not exists balance_due numeric,
  add column if not exists balance_paid_at timestamptz,
  add column if not exists balance_method text;

do $$ begin
  alter table public.bookings add constraint bookings_payment_mode_valid
    check (payment_mode in ('full', 'deposit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.bookings add constraint bookings_balance_method_valid
    check (balance_method is null or balance_method in ('cash', 'online'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.bookings add constraint bookings_deposit_amounts_sane
    check ((deposit_amount is null or deposit_amount >= 0) and (balance_due is null or balance_due >= 0));
exception when duplicate_object then null; end $$;

comment on column public.bookings.payment_mode is
  'full = whole fare online (hold or charge) · deposit = platform share online now, driver share (balance_due) later in cash or online.';
comment on column public.bookings.deposit_amount is
  'What was charged online at reservation for a deposit booking: commission + airport fee + HST. Written by the settle path from server-created Stripe metadata.';
comment on column public.bookings.balance_due is
  'The chauffeur''s share, payable later. Equals the driver payout for the ride; frozen at deposit time from the default driver share.';
comment on column public.bookings.balance_method is
  'How the balance was settled: cash (collected by the chauffeur at the ride) or online (second Stripe payment from the dashboard).';

-- Clients may see the deposit state but never write it — money columns are
-- service-role/admin territory, same as every other fare column.
grant select (payment_mode, deposit_amount, balance_due, balance_paid_at, balance_method)
  on public.bookings to authenticated;

-- Extend the tamper trigger (last recreated in 20260716170000) with the
-- deposit columns. A customer who could flip payment_mode or shrink
-- balance_due after paying a deposit would be writing their own price.
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

  if new.payment_mode is distinct from old.payment_mode
     or new.deposit_amount is distinct from old.deposit_amount
     or new.balance_due is distinct from old.balance_due
     or new.balance_paid_at is distinct from old.balance_paid_at
     or new.balance_method is distinct from old.balance_method then
    raise exception 'Deposit and balance fields can only be set by an administrator';
  end if;

  return new;
end;
$$;

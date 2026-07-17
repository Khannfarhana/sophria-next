-- Fare breakdown (16 Jul 2026). Until now `fare_estimate` was the only money
-- column and it was charged raw — no tax was ever added, while the booking UI
-- and FAQ both told the customer "fares are subject to 13% HST". Every
-- non-airport ride was therefore under-collecting HST. Client direction
-- (15 Jul): "for every ride 13% HST is mandatory", plus a $17.25 YYZ airport
-- fee on any airport pickup/dropoff.
--
-- Column meanings (all CAD, 2dp) — see src/lib/pricing.ts:priceBreakdown():
--   base_fare      raw vehicle/tariff fare before markup
--   markup_amount  tariff markup (30%); 0 on retail-rate hourly/one-way trips
--   airport_fee    GTAA pass-through, its own line on the receipt
--   fare_estimate  UNCHANGED MEANING: pre-tax subtotal the ride costs
--                  (= base_fare + markup_amount + airport_fee)
--   tax_amount     HST on the subtotal
-- Customer is charged fare_estimate + tax_amount + tip.
-- driver_payout stays a fraction of the PRE-TAX fare_estimate: drivers are not
-- paid a share of the government's tax.

alter table public.bookings
  add column if not exists base_fare numeric,
  add column if not exists markup_amount numeric not null default 0,
  add column if not exists airport_fee numeric not null default 0,
  add column if not exists tax_amount numeric not null default 0;

do $$ begin
  alter table public.bookings
    add constraint bookings_fare_parts_nonneg
    check (
      (base_fare is null or base_fare >= 0)
      and markup_amount >= 0
      and airport_fee >= 0
      and tax_amount >= 0
    );
exception when duplicate_object then null; end $$;

comment on column public.bookings.base_fare is
  'Raw vehicle/tariff fare (CAD) before markup, airport fee and tax.';
comment on column public.bookings.markup_amount is
  'Markup (CAD) applied to tariff-priced trips; 0 for retail-rate trips.';
comment on column public.bookings.airport_fee is
  'Airport pass-through fee (CAD) charged as its own line on airport trips.';
comment on column public.bookings.tax_amount is
  'HST (CAD) on fare_estimate. Charged on top; not part of the driver payout base.';

-- bookings SELECT is granted column-by-column (20260702134848) — without this
-- no client can read the new columns and the receipt renders blank.
grant select (base_fare, markup_amount, airport_fee, tax_amount)
  on public.bookings to authenticated;

-- Extend the tamper guard to every money column.
--
-- Note this closes a pre-existing hole as well as guarding the new columns:
-- `authenticated` holds table-level UPDATE on bookings (only SELECT is
-- column-restricted), so until now a customer could PATCH their own pending
-- booking's fare_estimate to $1 via PostgREST and then pay $1 — the guard only
-- covered driver_payout and tip. Trusted callers are unchanged: direct SQL,
-- the service role, and admins (updateBookingFareAction runs as admin).
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

  return new;
end;
$$;

-- Backfill: existing rows have a fare but no breakdown. Reconstruct what we
-- can — the stored fare_estimate is by definition the pre-tax subtotal, so it
-- becomes base_fare, and HST is derived from it. Airport fee and markup stay 0
-- rather than inventing history: these rides were quoted and charged without
-- them, and rewriting the amounts would desync from what Stripe actually took.
-- Only touches rows that predate the breakdown (base_fare is null).
update public.bookings
set base_fare = fare_estimate,
    tax_amount = case
      when payment_status = 'paid' then 0
      else round((fare_estimate * 0.13)::numeric, 2)
    end
where base_fare is null;

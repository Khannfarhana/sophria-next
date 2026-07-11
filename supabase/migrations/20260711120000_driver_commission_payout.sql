-- Driver payout model:
--   * drivers.commission_rate — fraction of the fare paid to the driver
--     (default 0.80). Admin-editable only: 20260702150930 revoked table-level
--     insert/update on drivers and re-granted per column, so this new column
--     is locked from authenticated by default (do NOT add it to those grant
--     lists). Also protected by the escalation trigger below.
--   * bookings.driver_payout — snapshot of fare_estimate × commission_rate
--     taken when the admin assigns a driver. Reassignment recomputes; later
--     rate changes never rewrite an existing snapshot. The driver portal
--     shows this figure instead of the customer fare.

alter table public.drivers
  add column if not exists commission_rate numeric not null default 0.80;

do $$ begin
  alter table public.drivers
    add constraint drivers_commission_rate_range
    check (commission_rate >= 0 and commission_rate <= 1);
exception when duplicate_object then null; end $$;

comment on column public.drivers.commission_rate is
  'Fraction of the fare paid to the driver (0–1). Admin-editable only.';

alter table public.bookings
  add column if not exists driver_payout numeric;

do $$ begin
  alter table public.bookings
    add constraint bookings_driver_payout_nonneg
    check (driver_payout is null or driver_payout >= 0);
exception when duplicate_object then null; end $$;

comment on column public.bookings.driver_payout is
  'Payout snapshot (2dp): fare_estimate × driver commission_rate at assignment time.';

-- bookings SELECT is granted column-by-column (20260702134848) — expose the
-- new column or no client can read it. Re-granting is a no-op (idempotent).
grant select (driver_payout) on public.bookings to authenticated;

-- Recreate the drivers escalation guard with commission_rate in the protected
-- set (same body as 20260705152922 plus the commission_rate clause; the
-- existing trigger keeps pointing at this function).
create or replace function public.prevent_driver_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Trusted callers: the service role (server-side actions) and admins.
  if coalesce((current_setting('request.jwt.claims', true)::json ->> 'role'), '') = 'service_role'
     or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if new.is_verified   is distinct from old.is_verified
     or new.total_earnings  is distinct from old.total_earnings
     or new.rating          is distinct from old.rating
     or new.commission_rate is distinct from old.commission_rate
     or new.user_id         is distinct from old.user_id then
    raise exception 'Drivers cannot modify verification, earnings, rating, commission, or user_id';
  end if;

  return new;
end;
$$;

-- bookings.driver_payout tamper guard: authenticated holds table-level UPDATE
-- on bookings (only SELECT is column-restricted), and drivers legitimately
-- update their assigned rows via RLS (accept/complete) — without this, a
-- driver could inflate driver_payout via the REST API before completing.
-- Only admins and the service role may change it.
create or replace function public.prevent_booking_payout_tamper()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Trusted callers: direct SQL connections (no JWT — migrations, SQL editor),
  -- the service role, and admins. The guard targets PostgREST users only.
  if coalesce(current_setting('request.jwt.claims', true), '') = ''
     or coalesce((current_setting('request.jwt.claims', true)::json ->> 'role'), '') = 'service_role'
     or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if new.driver_payout is distinct from old.driver_payout then
    raise exception 'driver_payout can only be set by an administrator';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_payout_tamper on public.bookings;
create trigger booking_payout_tamper
  before update on public.bookings
  for each row execute function public.prevent_booking_payout_tamper();

-- Backfill: snapshot payouts for every booking that already has a driver (any
-- status), rounded to cents, using the driver's CURRENT rate — the best
-- available proxy for rides assigned before this column existed. Idempotent
-- via the null check.
update public.bookings b
set driver_payout = round((b.fare_estimate * d.commission_rate)::numeric, 2)
from public.drivers d
where b.driver_id = d.id
  and b.driver_payout is null;

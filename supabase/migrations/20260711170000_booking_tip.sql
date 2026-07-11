-- Driver tip, chosen by the customer at payment time (+$2/+$5/+$10/custom).
-- The tip is charged with the fare through Stripe Checkout and goes 100% to
-- whichever driver completes the ride, ON TOP of their commission payout.
-- Safety: non-negative check at the DB level, and the payout tamper trigger
-- below also guards tip so it can't be rewritten via the REST API.

alter table public.bookings
  add column if not exists tip numeric not null default 0;

do $$ begin
  alter table public.bookings
    add constraint bookings_tip_nonneg
    check (tip >= 0);
exception when duplicate_object then null; end $$;

comment on column public.bookings.tip is
  'Driver tip (CAD) charged with the fare at checkout; credited to the driver in full on completion.';

-- bookings SELECT is granted column-by-column (20260702134848).
grant select (tip) on public.bookings to authenticated;

-- Extend the payout tamper guard to also cover tip. Same trusted callers:
-- direct SQL (no JWT), the service role, and admins.
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

  return new;
end;
$$;

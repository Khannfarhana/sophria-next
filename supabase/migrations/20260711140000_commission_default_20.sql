-- Business decision (11 Jul 2026): a driver's default share of the fare is
-- 20%, not the 80% shipped in 20260711120000. Follow-up because that
-- migration already ran against the live DB.

alter table public.drivers
  alter column commission_rate set default 0.20;

-- Align the drivers escalation guard with booking_payout_tamper: exempt
-- direct SQL connections (no JWT — migrations, SQL editor) too. The guard
-- targets PostgREST users; direct-SQL callers are already fully trusted.
create or replace function public.prevent_driver_privilege_escalation()
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

-- Move drivers still sitting on the old built-in default — none of these were
-- admin-customized (the 0.80 came from the previous migration's default).
update public.drivers
set commission_rate = 0.20
where commission_rate = 0.80;

-- Re-snapshot payouts for rides that haven't happened yet, at the driver's
-- (updated) current rate. Completed/cancelled/rejected bookings keep their
-- historical figures.
update public.bookings b
set driver_payout = round((b.fare_estimate * d.commission_rate)::numeric, 2)
from public.drivers d
where b.driver_id = d.id
  and b.status in ('driver_assigned', 'accepted', 'in_progress');

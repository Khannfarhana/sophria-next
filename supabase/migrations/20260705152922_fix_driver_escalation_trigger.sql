-- Fix prevent_driver_privilege_escalation():
--   1. It referenced NEW.total_rides / OLD.total_rides — a column that does not
--      exist on public.drivers — so EVERY update to a driver row raised
--      'record "new" has no field "total_rides"'. Removed.
--   2. It only exempted admins (via has_role), so trusted server code using the
--      service role (admin verify, ride-completion earnings, application submit)
--      was wrongly blocked. Exempt the service role too.
--
-- Intent preserved: a non-admin driver still cannot change verification,
-- earnings, rating, or user_id (also enforced by column-level grants).

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
     or new.total_earnings is distinct from old.total_earnings
     or new.rating        is distinct from old.rating
     or new.user_id       is distinct from old.user_id then
    raise exception 'Drivers cannot modify verification, earnings, rating, or user_id';
  end if;

  return new;
end;
$$;

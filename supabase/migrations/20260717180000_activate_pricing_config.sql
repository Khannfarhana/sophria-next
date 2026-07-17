-- Atomic activation of a pricing version (17 Jul 2026).
--
-- Publishing is two writes: stand the current version down, bring the new one
-- up. Done as two statements there is a window with NO active row, and
-- loadPricingConfig()'s .single() would fail, fall back to the built-in rates,
-- and quote from them — silently, mid-publish, on live bookings. Two admins
-- publishing at once would also race the one-active unique index.
--
-- A single UPDATE touching both rows closes the window: `is_active = (id = _id)`
-- flips the old one off and the new one on in one statement, so no reader ever
-- observes zero active versions.
create or replace function public.activate_pricing_config(_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.pricing_config
     set is_active = (id = _id)
   where is_active or id = _id;
$$;

-- SECURITY DEFINER and it decides what every customer is charged. Postgres
-- grants EXECUTE to PUBLIC by default, which would let any signed-in user
-- activate any historical rate card — including one an admin had stood down.
-- Revoke first; the server action already gates on requireSession("admin")
-- before calling this with the service role.
revoke all on function public.activate_pricing_config(uuid) from public;
revoke all on function public.activate_pricing_config(uuid) from anon, authenticated;
grant execute on function public.activate_pricing_config(uuid) to service_role;

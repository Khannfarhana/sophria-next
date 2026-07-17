-- activate_pricing_config must never leave zero active versions (17 Jul 2026).
--
-- The first cut was:
--
--   update public.pricing_config
--      set is_active = (id = _id)
--    where is_active or id = _id;
--
-- If _id matches NO row, the WHERE still matches the currently-active row, and
-- `is_active = (id = _id)` evaluates FALSE for it. The active version is stood
-- down and nothing is stood up: ZERO active rows, from one bad argument.
--
-- That state is silent and expensive. loadPricingConfig()'s .single() fails,
-- the catch falls back to DEFAULT_PRICING_CONFIG, and every quote — server and
-- browser — prices from the built-in constants while the database still holds
-- the real rate card. Nothing 500s. Nothing tells the operator their published
-- rates stopped applying; the only trace is a console line. It happened during
-- testing and was caught only because /terms started prerendering the config
-- and logged the fallback during a build.
--
-- The fallback is still right — a broken rate card must not stop people booking
-- — but it means this function has to be the thing that cannot fail quietly.
-- Raise instead: a publish that errors is recoverable, a publish that silently
-- unpublishes everything is not.
create or replace function public.activate_pricing_config(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if _id is null then
    raise exception 'activate_pricing_config: id is required';
  end if;
  if not exists (select 1 from public.pricing_config where id = _id) then
    raise exception 'activate_pricing_config: no pricing_config %', _id;
  end if;

  -- One statement, so no reader ever observes zero active versions mid-swap.
  update public.pricing_config
     set is_active = (id = _id)
   where is_active or id = _id;
end;
$$;

revoke all on function public.activate_pricing_config(uuid) from public;
revoke all on function public.activate_pricing_config(uuid) from anon, authenticated;
grant execute on function public.activate_pricing_config(uuid) to service_role;

-- Deleting the active version leaves the same zero-active hole by another door.
-- Nothing in the app deletes a version (publishing only ever inserts), so this
-- only fires on a hand-run DELETE — which is exactly when a guard is wanted.
create or replace function public.prevent_active_pricing_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_active then
    raise exception 'Cannot delete the active pricing_config — activate another version first';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_active_pricing_delete_trg on public.pricing_config;
create trigger prevent_active_pricing_delete_trg
  before delete on public.pricing_config
  for each row execute function public.prevent_active_pricing_delete();

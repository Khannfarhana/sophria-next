-- Per-vehicle distance pricing + one-way included km (23 Jul 2026).
--
-- The fare engine had exactly one per-km rate for the whole fleet
-- (pricing_config.retail_per_km): on a one-way trip a Stretch Limousine and an
-- Executive Sedan charged the same $2.75/km, so a vehicle's entire premium was
-- its base fare. Airport tariff trips already scale per class (multiplier);
-- retail trips now can too.
--
--   * vehicles.per_km_rate — this vehicle's one-way rate per km. NULL means
--     "use the global retail_per_km", so every existing vehicle keeps pricing
--     exactly as before until an admin sets a value.
--   * vehicles.min_fare — floor for retail quotes (one-way / hourly /
--     non-tariff airport). NULL = no floor. Tariff trips are excluded: those
--     follow the published GTAA card.
--   * pricing_config.oneway_free_km — km included in the base fare before the
--     per-km rate starts. Default 0 = today's behaviour (distance billed from
--     km zero on top of base).
--
-- All three are quoted client-side too (the rate card is public information);
-- the charge is still recomputed server-side, so none of this is tamperable.

alter table public.vehicles
  add column if not exists per_km_rate numeric,
  add column if not exists min_fare numeric;

do $$ begin
  alter table public.vehicles add constraint vehicles_per_km_rate_sane
    check (per_km_rate is null or (per_km_rate > 0 and per_km_rate <= 50));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicles add constraint vehicles_min_fare_sane
    check (min_fare is null or (min_fare >= 0 and min_fare <= 10000));
exception when duplicate_object then null; end $$;

comment on column public.vehicles.per_km_rate is
  'One-way $/km for THIS vehicle. NULL falls back to pricing_config.retail_per_km.';
comment on column public.vehicles.min_fare is
  'Minimum pre-tax fare for retail quotes (one-way/hourly/non-tariff airport). NULL = no floor. Never applied to Pearson tariff trips.';

alter table public.pricing_config
  add column if not exists oneway_free_km numeric not null default 0;

do $$ begin
  alter table public.pricing_config add constraint pricing_config_oneway_free_km_sane
    check (oneway_free_km >= 0 and oneway_free_km <= 200);
exception when duplicate_object then null; end $$;

comment on column public.pricing_config.oneway_free_km is
  'Kilometres included in the base fare on one-way trips before per-km billing starts. 0 = bill from the first km (historical behaviour).';

-- Honour the tariff card: published tariffs already include tax (17 Jul 2026).
--
-- THIS ONE CHANGES PRICES. Everything before it was deliberately a no-op.
--
-- The official "Toronto Pearson Limo Tariffs" card (February 2024) — the sheet
-- src/lib/tariff.ts encodes, pulled from GTAA's own CDN — states in its legend:
--
--     "All tariffs in Canadian dollars and includes taxes."
--
-- The code already said so, twice, and then did the opposite:
--   tariff.ts:11   "Published tariffs are tax-inclusive."
--   pricing.ts:131 "Pearson trips follow the official GTAA tariff (tax-inclusive)"
-- ...and priceBreakdown() then applied a 30% markup AND 13% HST on top of that
-- tax-inclusive number — marking up and re-taxing the government's own tax.
--
-- With the flag on, a tariff is converted to its pre-tax equivalent before the
-- markup and HST are applied, so HST is charged exactly once:
--
--   before:  55.00 -> +30% -> +17.25 fee -> +13% HST  = $100.29
--   after:   55.00 / 1.13 = 48.67 -> +30% -> +17.25 -> +13% HST = $90.99
--
-- Effect (Pearson TARIFF trips only — ~90% of the business):
--   T3 -> 1 de Boers  sedan  $100.29 -> $90.99   (-9.30, -10.2%)
--   T3 -> 1 de Boers  SUV    $125.34 -> $113.16  (-12.18)
--   T3 -> Downtown    sedan  $139.95 -> $126.10  (-13.85, -11.0%)
--   T3 -> Downtown    SUV    $177.30 -> $159.14  (-18.16)
--
-- Hourly, one-way and non-Pearson airport trips are UNAFFECTED: they price off
-- the vehicles table (the client's own retail rate sheet), which is genuinely
-- pre-tax. Only the tariff path was double-taxed.
--
-- Not a tax-compliance fix. HST was always arithmetically correct on the price
-- charged; the PRICE was ~11% higher than intended because a tax-inclusive
-- number was used as a pre-tax base. Market check (Jul 2026): competitors land
-- at $98-$117 all-in for YYZ->downtown sedan, so $139.95 was well above market
-- and $126.10 is closer to it.
--
-- A flag rather than a hardcoded divide, because it is a claim about the SOURCE
-- of the numbers in tariff_destinations. If those are ever replaced with a
-- pre-tax rate sheet, flip this off instead of editing the fare engine.

alter table public.pricing_config
  add column if not exists tariff_tax_inclusive boolean not null default true;

comment on column public.pricing_config.tariff_tax_inclusive is
  'True when tariff_destinations / the Pearson zone tariffs already include HST, as the official GTAA card states. The engine then converts a tariff to its pre-tax equivalent before applying markup and HST, so tax is charged once.';

-- Apply to the live version. Insert a new row rather than mutate the active one
-- — the table is the audit log, and a price change must be attributable.
insert into public.pricing_config (
  is_active, reason,
  hst_rate, yyz_airport_fee, airport_meet_greet, airport_free_km,
  tariff_markup_rate, retail_per_km, hourly_min_hours,
  tariff_per_km, tariff_in_zone_base, tariff_min, pearson_radius_km,
  extra_passenger_surcharge, multi_dropoff_charge, stop_wait_per_10min,
  default_driver_payout_rate, default_tip_rate, stripe_pct, stripe_fixed,
  tariff_tax_inclusive
)
select
  false, -- activated below, after the old row is stood down
  'Treat GTAA tariffs as tax-inclusive, per the official Feb 2024 card ("All tariffs in Canadian dollars and includes taxes") and tariff.ts:11. Stops HST being charged on top of a tax-inclusive tariff. Pearson tariff fares drop ~11%.',
  hst_rate, yyz_airport_fee, airport_meet_greet, airport_free_km,
  tariff_markup_rate, retail_per_km, hourly_min_hours,
  tariff_per_km, tariff_in_zone_base, tariff_min, pearson_radius_km,
  extra_passenger_surcharge, multi_dropoff_charge, stop_wait_per_10min,
  default_driver_payout_rate, default_tip_rate, stripe_pct, stripe_fixed,
  true
from public.pricing_config
where is_active;

-- Swap atomically: the partial unique index allows exactly one active row, so
-- the stand-down and the promotion must happen in one statement's worth of
-- visibility. Both run inside this migration's transaction.
update public.pricing_config set is_active = false where is_active;
update public.pricing_config set is_active = true
where id = (select id from public.pricing_config order by created_at desc limit 1);

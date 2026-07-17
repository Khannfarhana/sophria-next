-- Explicit fleet ordering, SUV first (16 Jul 2026).
--
-- Every surface ordered vehicles by base_rate ascending, which put the
-- Executive Sedan first. The client asked twice for the SUV to lead: "In place
-- of luxury sedan first must be SUV", and "here executive clients don't like to
-- search, what comes first that's it".
--
-- base_rate cannot express this anyway: Business Class and Luxury SUV are BOTH
-- 130, so their relative order was already undefined — Postgres had no
-- tiebreaker and the two could swap between queries.
--
-- Order per the client's fleet list (13 Jul):
--   1 SUV · 2 Executive Sedan · 3 Business Class · 4 Executive Sprinter
--   5 Stretched Limousine
-- Vehicle makes come from the same message.

alter table public.vehicles
  add column if not exists sort_order integer not null default 100;

comment on column public.vehicles.sort_order is
  'Display order, ascending. Set explicitly — base_rate ties (Business Class and SUV are both 130) make rate-based ordering non-deterministic.';

update public.vehicles set sort_order = 1 where type = 'suv';
update public.vehicles set sort_order = 2 where type = 'sedan';
update public.vehicles set sort_order = 3 where type = 'business';
update public.vehicles set sort_order = 4 where type = 'party_bus';
update public.vehicles set sort_order = 5 where type = 'limousine';

-- Vehicle makes, per the client's fleet list. The Escalade stays: an earlier
-- note (23 Jun) asked to swap it for the GMC Yukon XL Elevation, but the later
-- list names Yukon XL, Denali, Suburban AND Escalade together under the SUV
-- class, so all three are offered.
update public.vehicles
set features = array[
      'GMC Yukon XL / Denali',
      'Chevrolet Suburban · Cadillac Escalade',
      'Seats up to 6',
      'Ample luggage',
      'Winter-ready'
    ],
    description = 'Spacious luxury SUV for family transfers, group travel, and extra luggage capacity.'
where type = 'suv';

update public.vehicles
set features = array[
      'Cadillac LYRIQ / Lexus ES',
      'Leather interior',
      'Bottled water',
      'Phone chargers'
    ]
where type = 'sedan';

update public.vehicles
set features = array[
      'Mercedes S-Class / Volvo S90',
      'Extra legroom',
      'Privacy partition',
      'Onboard Wi-Fi'
    ]
where type = 'business';

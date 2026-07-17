-- Admin-managed pricing configuration (17 Jul 2026).
--
-- WHY: every rate in the fare engine is hardcoded in src/lib/pricing.ts and
-- src/lib/tariff.ts — 136 out-of-town tariffs and ~15 constants — so changing a
-- price needs a developer, a commit and a deploy. They are not constant:
--   * the GTAA pre-arranged pickup fee moved $15 -> $17.25;
--   * the tariff card this app encodes is dated February 2024 and GTAA
--     reprints it (Aerofleet's own site: tariffs "may change without notice");
--   * markup, meet & greet and the driver split are business decisions the
--     owner should make without asking an engineer.
--
-- Half of this already lives in the database and works: vehicles.base_rate /
-- hourly_rate are admin-managed with public read. This finishes the job using
-- the SAME shape rather than inventing a second security model.
--
-- SEEDED WITH TODAY'S EXACT VALUES. Applying this migration changes no price.
-- The engine keeps its current numbers until someone deliberately publishes new
-- ones. That is the point: this hands over the lever, it does not pull it.
--
-- NOT VERSIONED PER BOOKING, deliberately: bookings already snapshot
-- base_fare / markup_amount / airport_fee / tax_amount at booking time and the
-- tamper trigger freezes them, so changing config tomorrow cannot rewrite what
-- someone was charged last week. That is the hard part of this problem and it
-- was already solved.

-- ============================ pricing_config ============================
-- One row per published version. NEVER updated in place: publishing inserts a
-- new row and flips is_active, so the table IS the audit log and the rollback
-- mechanism. Mirrors updateBookingFareAction, which already refuses to change a
-- fare without a reason and keeps previous_fare.
create table if not exists public.pricing_config (
  id                uuid primary key default gen_random_uuid(),
  is_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  -- Why this version exists. Required: a money change without a reason is an
  -- unanswerable question three months later.
  reason            text not null,

  -- ── Tax ──────────────────────────────────────────────────────────────
  -- Ontario HST. Statutory, not a business decision — it changes by
  -- legislation, roughly once a decade. Editable for auditability, but the
  -- check constraint below is deliberately tight: a typo here misprices
  -- every ride at once.
  hst_rate                  numeric not null default 0.13,

  -- ── Airport ──────────────────────────────────────────────────────────
  -- GTAA pre-arranged pickup fee, passed through to the passenger as its own
  -- line. A cost the business remits, NOT revenue — driverPayoutBase excludes
  -- it from the driver's share.
  yyz_airport_fee           numeric not null default 17.25,
  -- Meet & greet folded into non-Pearson airport fares. This is what makes the
  -- advertised "airport transfers from $110" work (sedan base 95 + 15).
  -- Market comparison (Jul 2026): competitors charge $45-$80 for this.
  airport_meet_greet        numeric not null default 15,
  airport_free_km           numeric not null default 20,

  -- ── Markup & retail ──────────────────────────────────────────────────
  -- Applied to Pearson TARIFF fares only. The vehicles table already holds the
  -- client's retail rates, so marking those up again would contradict the
  -- published /pricing page.
  --
  -- NOTE FOR WHOEVER TUNES THIS: the GTAA tariff card states "All tariffs in
  -- Canadian dollars and includes taxes." Marking up a tax-inclusive number and
  -- then adding HST charges tax on tax. That is a live pricing decision, not
  -- something this migration silently changes.
  tariff_markup_rate        numeric not null default 0.30,
  -- Retail per-km for point-to-point. NOT the GTAA rate — see tariff_per_km.
  retail_per_km             numeric not null default 2.75,
  hourly_min_hours          integer not null default 2,

  -- ── GTAA tariff model ────────────────────────────────────────────────
  -- Published "trips outside zone map" rate. Verified against the official
  -- Feb 2024 card: "$2.01 per kilometre."
  tariff_per_km             numeric not null default 2.01,
  tariff_in_zone_base       numeric not null default 28,
  tariff_min                numeric not null default 40,
  pearson_radius_km         numeric not null default 3.5,

  -- ── Official tariff surcharges ───────────────────────────────────────
  -- Verbatim from the Feb 2024 card's Additional Information section.
  -- "A $15.00 surcharge applies when a driver is asked to transport more than
  --  4 passengers and/or excess baggage ... only be charged once per trip."
  extra_passenger_surcharge numeric not null default 15,
  -- "$15.00 additional charge for each passenger dropped off on route."
  multi_dropoff_charge      numeric not null default 15,
  -- "Passenger requested stops: $10 for each 10 minutes or part thereof."
  stop_wait_per_10min       numeric not null default 10,

  -- ── Driver economics ─────────────────────────────────────────────────
  -- Fallback when a driver has no explicit commission_rate. Stores the
  -- DRIVER's share (0.75 pays the chauffeur 75%), not the platform's cut.
  default_driver_payout_rate numeric not null default 0.75,
  default_tip_rate           numeric not null default 0.15,

  -- ── Cost of taking the money ─────────────────────────────────────────
  -- Stripe's cut. Modelled nowhere before this, which meant every margin
  -- figure in the business was overstated: on a $100.29 fare Stripe takes
  -- $3.21 — 18% of gross margin — and the fare engine did not know it existed.
  -- Not charged to the customer; used to show true contribution per ride.
  stripe_pct                numeric not null default 0.029,
  stripe_fixed              numeric not null default 0.30
);

-- Guard rails. There is no code review on an admin form, so the database is the
-- last line: reject the fat-finger rather than let it price every ride.
do $$ begin
  alter table public.pricing_config add constraint pricing_config_sane check (
    hst_rate between 0 and 0.25
    and tariff_markup_rate between 0 and 2
    and default_driver_payout_rate between 0 and 1
    and default_tip_rate between 0 and 1
    and yyz_airport_fee between 0 and 200
    and airport_meet_greet between 0 and 500
    and retail_per_km between 0 and 50
    and tariff_per_km between 0 and 50
    and tariff_in_zone_base between 0 and 500
    and tariff_min between 0 and 500
    and pearson_radius_km between 0 and 50
    and hourly_min_hours between 1 and 24
    and extra_passenger_surcharge between 0 and 200
    and multi_dropoff_charge between 0 and 200
    and stop_wait_per_10min between 0 and 200
    and stripe_pct between 0 and 0.1
    and stripe_fixed between 0 and 5
  );
exception when duplicate_object then null; end $$;

-- Exactly one active version, enforced by the database rather than by hoping
-- the application remembers.
create unique index if not exists pricing_config_one_active
  on public.pricing_config (is_active) where is_active;

-- Seed = the current hardcoded constants, verbatim. No price moves today.
insert into public.pricing_config (is_active, reason)
select true, 'Initial import of the hardcoded rates from pricing.ts / tariff.ts — no price change.'
where not exists (select 1 from public.pricing_config);

-- ========================= tariff_destinations =========================
-- The 136 named out-of-town fares from the official card. Kept as rows rather
-- than columns so the client can add a destination without a schema change.
create table if not exists public.tariff_destinations (
  name       text primary key,
  -- Tax-INCLUSIVE, as published. See the note on tariff_markup_rate.
  tariff      numeric not null check (tariff >= 0 and tariff <= 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ====================== vehicles.tariff_multiplier ======================
-- The tariff class multiplier belongs ON the vehicle (which already owns
-- base_rate, hourly_rate and sort_order), not in a parallel hardcoded map that
-- has to be kept in step with the table by hand.
alter table public.vehicles
  add column if not exists tariff_multiplier numeric not null default 1.0;

do $$ begin
  alter table public.vehicles add constraint vehicles_tariff_multiplier_sane
    check (tariff_multiplier > 0 and tariff_multiplier <= 10);
exception when duplicate_object then null; end $$;

-- Mirrors TARIFF_MULTIPLIERS in tariff.ts EXACTLY: sedan pays the published
-- tariff, larger classes scale by class. Any drift here silently reprices every
-- Pearson trip for that class, so these are copied from the source, not
-- estimated.
update public.vehicles set tariff_multiplier = 1.0  where type = 'sedan';
update public.vehicles set tariff_multiplier = 1.3  where type in ('business', 'suv');
update public.vehicles set tariff_multiplier = 2.5  where type = 'limousine';
update public.vehicles set tariff_multiplier = 3.0  where type = 'party_bus';

-- ================================ RLS ==================================
-- Same shape as vehicles ("Anyone views active vehicles" / "Admins manage
-- vehicles"): the rate card is public information — the customer is quoted from
-- it — and only an admin may write. The fare a customer is CHARGED is still
-- recomputed server-side (createBookingAction ignores any client amount), so a
-- publicly readable config cannot become a tampered price; at worst a tampered
-- client shows a wrong preview and the server bills the right number.
alter table public.pricing_config enable row level security;
alter table public.tariff_destinations enable row level security;

do $$ begin
  create policy "Anyone views active pricing config" on public.pricing_config
    for select using (is_active or public.has_role(auth.uid(), 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage pricing config" on public.pricing_config
    for all using (public.has_role(auth.uid(), 'admin'))
    with check (public.has_role(auth.uid(), 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone views tariff destinations" on public.tariff_destinations
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage tariff destinations" on public.tariff_destinations
    for all using (public.has_role(auth.uid(), 'admin'))
    with check (public.has_role(auth.uid(), 'admin'));
exception when duplicate_object then null; end $$;

-- Grants. Read for everyone, writes ONLY through the admin policy — and note
-- these tables were created here, so Supabase's default privileges have not had
-- a chance to hand anon/authenticated the `arw` they hold on the older tables
-- (see 20260717120000 / 20260717130000). Be explicit anyway.
revoke all on table public.pricing_config from anon, authenticated;
revoke all on table public.tariff_destinations from anon, authenticated;
grant select on table public.pricing_config to anon, authenticated;
grant select on table public.tariff_destinations to anon, authenticated;
grant insert, update, delete on table public.pricing_config to authenticated;
grant insert, update, delete on table public.tariff_destinations to authenticated;

-- service_role needs an EXPLICIT grant. The older tables have it only because
-- Supabase's default privileges fired when they were created through Supabase;
-- these were created by `postgres` over a direct connection, so they inherited
-- nothing. Without this, loadPricingConfig() fails with "permission denied",
-- silently falls back to the built-in rates, and the whole config system is
-- dead on arrival — the owner publishes a change and nothing happens, forever.
grant all on table public.pricing_config to service_role;
grant all on table public.tariff_destinations to service_role;

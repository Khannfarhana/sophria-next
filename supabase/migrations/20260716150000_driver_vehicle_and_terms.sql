-- Driver vehicle details, eligibility and terms acceptance (16 Jul 2026).
--
-- Onboarding was built driver-only: "Driver-only onboarding — no vehicle
-- documents collected" (become-chauffeur/page.tsx), on the assumption that
-- chauffeurs drive company cars. The client has since made the model explicit
-- (14 Jul): SophRia runs its own fleet AND a partner network of drivers who
-- bring their own vehicles, "similar to Uber's model". Applicants must now
-- declare the vehicle they will drive and prove they own and can insure it.
--
-- Eligibility, per the client's requirements (13 Jul):
--   * valid Ontario G licence, minimum 3 years
--   * licence to operate as a vehicle-for-hire driver
--   * luxury sedan or SUV carrying a limousine plate
--   * clean abstract and background check
--   * commercial insurance
--
-- These columns are deliberately NOT added to the 20260702150930 grant lists.
-- Only submitDriverApplicationAction writes them, and it runs as the service
-- role; leaving them ungranted keeps PostgREST from letting an applicant
-- rewrite their own limo plate or, worse, self-stamp terms_accepted_at.

alter table public.drivers
  add column if not exists licence_class text,
  add column if not exists limo_plate text,
  add column if not exists vehicle_make text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_year integer,
  add column if not exists vehicle_class text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

do $$ begin
  alter table public.drivers
    add constraint drivers_vehicle_year_sane
    check (vehicle_year is null or (vehicle_year >= 1980 and vehicle_year <= 2100));
exception when duplicate_object then null; end $$;

comment on column public.drivers.licence_class is
  'Ontario licence class as declared by the applicant (G required to drive for hire).';
comment on column public.drivers.limo_plate is
  'Limousine plate on the applicant''s vehicle. Required — a vehicle for hire cannot run without one.';
comment on column public.drivers.vehicle_class is
  'Declared vehicle category (sedan | suv). Mirrors vehicle_type values but is free text: this describes the DRIVER''S own car, not a fleet vehicle.';
comment on column public.drivers.terms_accepted_at is
  'When the applicant accepted the chauffeur terms. Legal record — service-role only, never client-writable.';
comment on column public.drivers.terms_version is
  'Which version of the chauffeur terms was accepted, so a later revision does not silently reinterpret past consent.';

-- drivers SELECT is not column-restricted the way bookings is, but the admin
-- review dialog reads these through the service role anyway.

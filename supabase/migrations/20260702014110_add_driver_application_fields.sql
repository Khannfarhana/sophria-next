-- Driver onboarding application details (driver-only — no vehicle info).
-- Collected on /become-chauffeur. Nullable so existing driver rows are unaffected.

alter table public.drivers
  add column if not exists city_of_residence text,
  add column if not exists province text,
  add column if not exists work_authorization text,
  add column if not exists languages_spoken text,
  add column if not exists time_availability text,
  add column if not exists referral_name text,
  add column if not exists photo_url text;

comment on column public.drivers.city_of_residence is 'Applicant city of residence';
comment on column public.drivers.province is 'Applicant province/state';
comment on column public.drivers.work_authorization is 'Work authorization status';
comment on column public.drivers.languages_spoken is 'Languages spoken (comma-separated)';
comment on column public.drivers.time_availability is 'General availability (full-time, part-time, etc.)';
comment on column public.drivers.referral_name is 'Optional referral name';
comment on column public.drivers.photo_url is 'Storage path to the driver profile photo';

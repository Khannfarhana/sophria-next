-- Two application types + resumable application drafts (23 Jul 2026).
--
-- The client's model (14 Jul) is a fleet PLUS a partner network: some
-- chauffeurs bring their own vehicle ("owner_operator"), some apply to drive
-- SophRia's cars ("fleet_driver"). Vehicle details and vehicle paperwork are
-- only meaningful for the former, so the application now declares its type.
-- The 14 Jul "nothing is optional" instruction applied to owner-operators;
-- that path keeps every requirement — fleet drivers simply never had a
-- vehicle to document.
--
-- Drafts: applicants abandon mid-form (12 uploads is a lot of paperwork to
-- have at hand in one sitting). Progress now persists server-side per stage,
-- so a half-done application survives a reload/device switch, and admins can
-- see who has STARTED applying — and where they stalled — before submission.

-- ============================ drivers.application_type ============================
alter table public.drivers
  add column if not exists application_type text;

do $$ begin
  alter table public.drivers
    add constraint drivers_application_type_valid
    check (application_type is null or application_type in ('owner_operator', 'fleet_driver'));
exception when duplicate_object then null; end $$;

-- Every pre-existing application declared a vehicle (the form required it).
update public.drivers set application_type = 'owner_operator' where application_type is null;

comment on column public.drivers.application_type is
  'owner_operator = brings their own vehicle (all vehicle docs mandatory) · fleet_driver = drives a SophRia fleet car (no vehicle paperwork). Written by the service role at submission.';

-- Deliberately NOT added to the authenticated insert/update grants
-- (20260717130000): only submitDriverApplicationAction writes it, service-role.

-- ============================ driver_application_drafts ============================
-- One scratch row per applicant, owner-writable. Deleted on submission.
-- doc_paths/photo_path are OWNER-written strings; anything that later signs or
-- persists them (submitDriverApplicationAction) re-checks the auth.uid() prefix,
-- exactly as it does for the submitted paths.
create table if not exists public.driver_application_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  application_type text not null default 'owner_operator'
    check (application_type in ('owner_operator', 'fleet_driver')),
  -- The wizard step the applicant is currently on. 'vehicle' only occurs for
  -- owner_operator drafts.
  stage text not null default 'personal'
    check (stage in ('personal', 'professional', 'vehicle', 'documents')),
  form jsonb not null default '{}'::jsonb,
  photo_path text,
  doc_paths jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Scratch data, but still client-written JSONB — cap it so a hostile client
  -- can't park megabytes per row. Real forms are ~1 KB.
  constraint driver_drafts_form_size check (pg_column_size(form) <= 16384),
  constraint driver_drafts_docs_size check (pg_column_size(doc_paths) <= 8192)
);

comment on table public.driver_application_drafts is
  'In-progress /become-chauffeur applications, one per user. Autosaved per stage; removed when the application is submitted. Admins read it to track the funnel.';

alter table public.driver_application_drafts enable row level security;

-- Owners manage their own draft; admins may look (read-only) to track progress.
drop policy if exists "Applicants manage own draft" on public.driver_application_drafts;
create policy "Applicants manage own draft"
  on public.driver_application_drafts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins view all drafts" on public.driver_application_drafts;
create policy "Admins view all drafts"
  on public.driver_application_drafts
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Explicit grants, and none for anon — mirroring 20260717130000's stance of
-- not leaving anon privileges lying around for RLS to be the only guard.
revoke all on table public.driver_application_drafts from anon;
grant select, insert, update, delete on table public.driver_application_drafts to authenticated;

-- updated_at is what the admin funnel sorts by ("last activity"), so stamp it
-- server-side rather than trusting the client's clock.
create or replace function public.touch_driver_draft_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at; -- immutable once set
  return new;
end;
$$;

drop trigger if exists touch_driver_draft_updated_at_trg on public.driver_application_drafts;
create trigger touch_driver_draft_updated_at_trg
  before update on public.driver_application_drafts
  for each row execute function public.touch_driver_draft_updated_at();

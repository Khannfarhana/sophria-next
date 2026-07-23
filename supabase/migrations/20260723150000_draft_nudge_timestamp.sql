-- Nudge tracking for in-progress applications (23 Jul 2026).
--
-- Admins can now email a stalled applicant a reminder to finish their
-- application. The timestamp lives on the draft so the admin UI can show when
-- the last nudge went out and the server action can rate-limit (one per 24h) —
-- without it, an admin could accidentally spam an applicant from two tabs.
-- Written only by the service role inside nudgeDriverApplicantAction; the
-- applicant's own upsert never touches it.

alter table public.driver_application_drafts
  add column if not exists nudged_at timestamptz;

comment on column public.driver_application_drafts.nudged_at is
  'When an admin last sent this applicant a "finish your application" reminder. Service-role written; used for the 24h nudge cooldown.';

-- updated_at feeds the admin funnel's "Last active" column, which is read as
-- APPLICANT activity. A nudge is admin activity — if the touch trigger bumped
-- updated_at for it, every nudge would make a stalled applicant look freshly
-- active and hide exactly the staleness the nudge exists to address.
create or replace function public.touch_driver_draft_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.created_at := old.created_at; -- immutable once set
  if new.nudged_at is distinct from old.nudged_at
     and new.stage = old.stage
     and new.application_type = old.application_type
     and coalesce(new.photo_path, '') = coalesce(old.photo_path, '')
     and new.form::text = old.form::text
     and new.doc_paths::text = old.doc_paths::text then
    new.updated_at := old.updated_at; -- nudge-only write: not applicant activity
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

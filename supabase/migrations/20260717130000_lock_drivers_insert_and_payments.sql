-- Close self-verification on drivers, and forged rows on payments (17 Jul 2026).
--
-- Same regression as 20260717120000, which repaired `bookings` only. The live
-- ACLs show Supabase's default privileges were reapplied across the schema:
--
--   drivers           {... anon=arw ... authenticated=arw ...}   <- a = INSERT
--   payments          {... anon=ar  ... authenticated=ar  ...}   <- a = INSERT
--   profiles          {... anon=arw ... authenticated=arw ...}
--   driver_documents  {... anon=arw ... authenticated=arw ...}
--   user_roles        {... anon=r   ... authenticated=r   ...}   <- safe, SELECT only
--   vehicles          {... anon=r   ... authenticated=r   ...}   <- safe, SELECT only
--
-- ============================ drivers ============================
-- CRITICAL: table-level INSERT on drivers was a privilege escalation.
--
-- 20260702150930 locked this with column grants, precisely so a user could not
-- "self-insert with is_verified=true". A table-level grant overrides column
-- grants entirely (Postgres never consults pg_attribute.attacl once the table
-- privilege matches), so that control was silently void. Three layers all
-- failed to stop it:
--
--   1. Grant  — table-level INSERT allows every column.
--   2. RLS    — "Driver inserts own record" only CHECKs (auth.uid() = user_id).
--               RLS is row-level; it cannot restrict WHICH columns are written.
--   3. Trigger— prevent_driver_privilege_escalation_trg is BEFORE UPDATE only.
--               It never fires on INSERT. It could not have: the body compares
--               against `old`, which is NULL on INSERT.
--
-- Every signed-in user holds a real Supabase JWT (auth.ts mints one and
-- use-supabase.ts hands it to the browser), so this was reachable with a single
-- REST call by any customer:
--
--   POST /rest/v1/drivers
--   {"user_id":"<self>","license_number":"X","is_verified":true,
--    "is_available":true,"commission_rate":1.0,"rating":5}
--
-- Impact: they appear in the admin's assignable list (admin/page.tsx filters on
-- is_verified && is_available) as a vetted chauffeur having uploaded no
-- documents, defeating the entire vetting gate — and driver_payout is
-- fare_estimate * commission_rate, so they collect 100% of every fare.
--
-- Fixed at two layers, deliberately. The grant is the primary control, but it
-- has now demonstrably reverted twice; the trigger is the one that survives a
-- default-privileges reset, so it must carry the invariant on its own.

revoke insert, update on table public.drivers from authenticated;

-- Restores 20260702150930's lists verbatim. Note the privileged columns
-- (is_verified, commission_rate, rating, total_earnings) appear in NEITHER, and
-- must not: admin verification and ride-completion earnings run through
-- service-role server actions behind an in-code auth check.
--
-- No application path actually needs INSERT here any more —
-- submitDriverApplicationAction upserts via the SERVICE ROLE after zod
-- validation — but the safe list is kept so a client-side self-application
-- still works if reintroduced, rather than failing in a way someone would
-- "fix" by granting the table again.
grant insert (
  user_id, license_number, experience_years, is_available,
  city_of_residence, province, work_authorization, languages_spoken,
  time_availability, referral_name, photo_url
) on public.drivers to authenticated;

-- updateDriverAvailabilityAction runs on the USER's JWT (not the service role),
-- so is_available must stay writable or a driver cannot go on/off duty.
grant update (
  license_number, experience_years, is_available,
  city_of_residence, province, work_authorization, languages_spoken,
  time_availability, referral_name, photo_url, updated_at
) on public.drivers to authenticated;

-- The durable half: make the trigger cover INSERT.
--
-- On INSERT the privileged columns are PINNED rather than compared — `old` is
-- NULL, so there is nothing to compare against, and raising would reject a
-- legitimate application that never mentioned them. Pinning is also the honest
-- semantic: a self-inserted driver row is always unverified, unpaid and on the
-- default rate, whatever the caller asked for. Trusted callers (service role,
-- admin, direct SQL) return early above and are unaffected.
create or replace function public.prevent_driver_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = ''
     or coalesce((current_setting('request.jwt.claims', true)::json ->> 'role'), '') = 'service_role'
     or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    -- Literals mirror the column defaults (commission_rate 0.75 per
    -- 20260716130000 / DEFAULT_DRIVER_PAYOUT_RATE, rating 5.00). If a default
    -- changes, change it here too.
    new.is_verified    := false;
    new.total_earnings := 0;
    new.rating         := 5.00;
    new.commission_rate := 0.75;
    return new;
  end if;

  if new.is_verified   is distinct from old.is_verified
     or new.total_earnings  is distinct from old.total_earnings
     or new.rating          is distinct from old.rating
     or new.commission_rate is distinct from old.commission_rate
     or new.user_id         is distinct from old.user_id then
    raise exception 'Drivers cannot modify verification, earnings, rating, commission, or user_id';
  end if;

  return new;
end;
$$;

-- The trigger itself is not in this repo (the table is managed outside these
-- migrations) and exists live as BEFORE UPDATE. Recreate it to cover INSERT.
drop trigger if exists prevent_driver_privilege_escalation_trg on public.drivers;
create trigger prevent_driver_privilege_escalation_trg
  before insert or update on public.drivers
  for each row execute function public.prevent_driver_privilege_escalation();

-- ============================ payments ============================
-- The money ledger is INSERT-able by customers: relacl `authenticated=ar`, and
-- "Customers insert payments for own bookings" CHECKs only that the booking is
-- theirs — amount, status and stripe_id are all caller-chosen. A customer can
-- forge {amount: 0.01, status: 'paid', stripe_id: 'pi_forged'} against their
-- own booking, corrupting the ledger and admin revenue reporting.
--
-- This does NOT buy a free ride (bookings.payment_status is a different table,
-- guarded separately), which is why it is not critical. But no client path
-- inserts here at all: every legitimate row is written by the service role in
-- payments.ts at capture. The grant is pure attack surface.
revoke insert on table public.payments from authenticated, anon;

-- ======================= anon write privileges =======================
-- anon holds write grants across these tables from the same default-privileges
-- reset. RLS is the only thing stopping it today: every policy on them names
-- `authenticated`, so an anonymous caller matches none and writes nothing.
-- That is one forgotten `to anon` on a future policy away from unauthenticated
-- writes to driver records and passenger profiles. None of these are ever
-- anonymously writable, so take the privileges away and stop relying on RLS to
-- be the only thing standing there.
revoke insert, update on table public.drivers from anon;
revoke insert, update on table public.profiles from anon;
revoke insert, update on table public.driver_documents from anon;

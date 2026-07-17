-- Atomic driver earnings, and server-side upload limits (17 Jul 2026).
--
-- ===================== credit_driver_earnings =====================
-- completeRideAction credited earnings with a read-modify-write:
--
--   read  total_earnings          (actions.ts, with the booking lookup)
--   ...
--   write total_earnings + earned (service role)
--
-- The `status = 'in_progress'` guard on the booking update makes each BOOKING
-- capture-once, but does nothing across DIFFERENT bookings. A driver finishing
-- two rides in the same moment (or double-tapping Complete on two tabs) has
-- both reads see total_earnings = 1000; ride A writes 1150, ride B writes 1200,
-- and A's $150 is gone. Nothing reconciles it: total_earnings is a standalone
-- denormalised counter, not derived from bookings or payments, so the money is
-- simply never paid.
--
-- `total_earnings = total_earnings + _amount` in a single statement takes a row
-- lock and re-reads under it, so concurrent credits serialise instead of
-- clobbering.
create or replace function public.credit_driver_earnings(_driver_id uuid, _amount numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _new numeric;
begin
  if _amount is null or _amount < 0 then
    raise exception 'credit_driver_earnings: amount must be >= 0 (got %)', _amount;
  end if;

  update public.drivers
     set total_earnings = total_earnings + _amount
   where id = _driver_id
  returning total_earnings into _new;

  if not found then
    raise exception 'credit_driver_earnings: no driver %', _driver_id;
  end if;

  return _new;
end;
$$;

-- CRITICAL: this is SECURITY DEFINER and writes total_earnings — the exact
-- column prevent_driver_privilege_escalation exists to protect. Postgres grants
-- EXECUTE to PUBLIC on new functions by default, which would hand every signed-
-- in user a "pay myself" RPC and be a worse hole than the one being fixed.
-- Revoke first, then grant only to the service role that completeRideAction
-- uses. (The escalation trigger is still a second layer: it reads
-- request.jwt.claims, which SECURITY DEFINER does not alter, so a caller with
-- an `authenticated` JWT would be blocked there too.)
revoke all on function public.credit_driver_earnings(uuid, numeric) from public;
revoke all on function public.credit_driver_earnings(uuid, numeric) from anon, authenticated;
grant execute on function public.credit_driver_earnings(uuid, numeric) to service_role;

-- ===================== driver-documents bucket =====================
-- The bucket was created with (id, name, public) only — no file_size_limit and
-- no allowed_mime_types. driver-docs.ts validates size and MIME, but it runs in
-- the BROWSER (become-chauffeur uploads straight to storage with the user's
-- own JWT), and the `accept` attribute is only a picker filter. So the limits
-- were advisory: any signed-in user could PUT a 5 GB file, or unlimited files,
-- into their own ${user.id}/ prefix — /become-chauffeur is open to every
-- authenticated user, no driver role needed. Unbounded storage and egress
-- billing, and a route to storing arbitrary content (e.g. text/html served
-- from the storage origin an admin opens signed URLs on).
--
-- Values mirror driver-docs.ts: MAX_UPLOAD_BYTES (10 MB) and ACCEPTED_DOC_MIME.
-- Keep the two in step.
update storage.buckets
   set file_size_limit = 10485760, -- 10 * 1024 * 1024
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'application/pdf'
       ]
 where id = 'driver-documents';

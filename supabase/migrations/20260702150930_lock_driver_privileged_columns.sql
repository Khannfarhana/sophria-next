-- Prevent drivers/customers from self-setting trusted fields on public.drivers.
-- RLS allowed a user to insert/update their OWN driver row (auth.uid()=user_id),
-- but placed no restriction on WHICH columns — so a user could self-insert with
-- is_verified=true or inflate total_earnings/rating.
--
-- Fix with column-level privileges: the `authenticated` role may only write the
-- application-editable columns. is_verified / rating / total_earnings become
-- writable only by the service role (admin verify + ride-completion earnings go
-- through service-role server actions after an in-code auth check).
--
-- ⚠ When adding a new driver column that users should edit, add it to both grants.

revoke insert, update on table public.drivers from authenticated;

grant insert (
  user_id, license_number, experience_years, is_available,
  city_of_residence, province, work_authorization, languages_spoken,
  time_availability, referral_name, photo_url
) on public.drivers to authenticated;

grant update (
  license_number, experience_years, is_available,
  city_of_residence, province, work_authorization, languages_spoken,
  time_availability, referral_name, photo_url, updated_at
) on public.drivers to authenticated;

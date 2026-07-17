-- Backfill the `pricing` role onto existing admins (17 Jul 2026).
--
-- Separate file because 20260717200000 adds the enum value, and Postgres will
-- not let a new enum value be USED until the transaction that added it commits.
--
-- Every current admin keeps exactly what they had: they were already able to
-- change prices (implicitly, via the admin role), so granting it explicitly
-- takes nothing away and locks nobody out. From here on, an admin account
-- created WITHOUT this role can run dispatch and cannot touch the rate card.
insert into public.user_roles (user_id, role)
select ur.user_id, 'pricing'::public.app_role
from public.user_roles ur
where ur.role = 'admin'
on conflict (user_id, role) do nothing;

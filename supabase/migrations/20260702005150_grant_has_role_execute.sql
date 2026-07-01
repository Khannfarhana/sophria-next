-- Fix: RLS policies call public.has_role(uuid, app_role), but EXECUTE was only
-- granted to postgres/service_role. Because Postgres OR-evaluates every policy
-- on a table, any SELECT (even the public "view active vehicles" path) also
-- evaluated the admin policy's has_role() call and errored with
-- "permission denied for function has_role" — making vehicles/bookings appear
-- empty to logged-in users. Grant EXECUTE to the client roles.

grant execute on function public.has_role(uuid, app_role) to authenticated, anon;

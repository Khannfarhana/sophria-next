
CREATE OR REPLACE FUNCTION public.driver_decline_ride(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _driver_id uuid;
BEGIN
  SELECT id INTO _driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF _driver_id IS NULL THEN
    RAISE EXCEPTION 'Not a driver';
  END IF;

  UPDATE public.bookings
  SET driver_id = NULL,
      status = 'confirmed'
  WHERE id = _booking_id
    AND driver_id = _driver_id
    AND status = 'driver_assigned';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not assigned to current driver or not in driver_assigned state';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.driver_decline_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_decline_ride(uuid) TO authenticated;

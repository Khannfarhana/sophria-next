
-- Trigger: prevent non-admin drivers from changing protected fields on their own row
CREATE OR REPLACE FUNCTION public.prevent_driver_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.total_rides IS DISTINCT FROM OLD.total_rides
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Drivers cannot modify verification, earnings, rating, ride count, or user_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_driver_privilege_escalation_trg ON public.drivers;
CREATE TRIGGER prevent_driver_privilege_escalation_trg
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.prevent_driver_privilege_escalation();

-- Payments: allow customers to insert payment rows tied to their own bookings
CREATE POLICY "Customers insert payments for own bookings"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = payments.booking_id
      AND b.customer_id = auth.uid()
  )
);

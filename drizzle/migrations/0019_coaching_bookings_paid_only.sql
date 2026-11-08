-- Bookings are only created by the server checkout flow (Stripe), never directly by users.
DROP POLICY IF EXISTS "coaching_bookings insert by user" ON public.coaching_bookings;

-- Participants (customer / coach) may only cancel through the Data API; status
-- changes like confirm/complete and all payment fields are server-only.
CREATE OR REPLACE FUNCTION public.guard_coaching_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Du kan kun aflyse bookingen.' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled'::coaching_booking_status THEN
    RAISE EXCEPTION 'Du kan kun aflyse bookingen.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_coaching_booking_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_coaching_booking_update_trg ON public.coaching_bookings;
CREATE TRIGGER guard_coaching_booking_update_trg
BEFORE UPDATE ON public.coaching_bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_coaching_booking_update();
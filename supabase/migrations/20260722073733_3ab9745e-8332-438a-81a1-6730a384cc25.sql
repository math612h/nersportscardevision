-- Prevent non-admin users from changing donation fields or achievements on their own profile via a BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_field_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Service role / internal (no auth context) may update freely
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins may update freely
  IF private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot modify donation fields or achievements
  IF NEW.donation_tier IS DISTINCT FROM OLD.donation_tier THEN
    NEW.donation_tier := OLD.donation_tier;
  END IF;
  IF NEW.donation_total_dkk IS DISTINCT FROM OLD.donation_total_dkk THEN
    NEW.donation_total_dkk := OLD.donation_total_dkk;
  END IF;
  IF NEW.donation_note IS DISTINCT FROM OLD.donation_note THEN
    NEW.donation_note := OLD.donation_note;
  END IF;
  IF NEW.achievements IS DISTINCT FROM OLD.achievements THEN
    NEW.achievements := OLD.achievements;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privileged_profile_field_edits_trg ON public.profiles;
CREATE TRIGGER prevent_privileged_profile_field_edits_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_privileged_profile_field_edits();
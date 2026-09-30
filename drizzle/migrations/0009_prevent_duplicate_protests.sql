CREATE OR REPLACE FUNCTION public.prevent_duplicate_protest()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.protests
    WHERE submitted_by = NEW.submitted_by
      AND division_id = NEW.division_id
      AND description = NEW.description
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Du har allerede indsendt denne protest.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_duplicate_protest ON public.protests;
CREATE TRIGGER trg_prevent_duplicate_protest BEFORE INSERT ON public.protests
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_protest();
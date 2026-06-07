
CREATE OR REPLACE FUNCTION public.trg_refresh_rating_on_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.league_id IS NOT NULL AND NEW.car_class IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.leagues WHERE id = NEW.league_id) THEN
    PERFORM public.refresh_user_league_rating(NEW.user_id, NEW.league_id, NEW.car_class);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_refresh_rating ON public.entries;
CREATE TRIGGER trg_entries_refresh_rating
AFTER INSERT OR UPDATE OF league_id, car_class ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_rating_on_entry();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT e.user_id, e.league_id, e.car_class
      FROM public.entries e
      JOIN public.leagues l ON l.id = e.league_id
     WHERE e.car_class IS NOT NULL
  LOOP
    PERFORM public.refresh_user_league_rating(r.user_id, r.league_id, r.car_class);
  END LOOP;
END $$;

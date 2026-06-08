
DELETE FROM public.entries e
WHERE e.league_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = e.league_id);

CREATE OR REPLACE FUNCTION public.trg_refresh_rating_on_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e RECORD;
BEGIN
  FOR e IN
    SELECT DISTINCT en.league_id
      FROM public.entries en
      JOIN public.leagues l ON l.id = en.league_id
     WHERE en.user_id = NEW.user_id
       AND en.car_class = NEW.car_class
       AND en.league_id IS NOT NULL
  LOOP
    PERFORM public.refresh_user_league_rating(NEW.user_id, e.league_id, NEW.car_class);
  END LOOP;
  RETURN NULL;
END;
$function$;

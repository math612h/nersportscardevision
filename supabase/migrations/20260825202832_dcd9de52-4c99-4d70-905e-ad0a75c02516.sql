CREATE INDEX IF NOT EXISTS idx_leaderboard_times_class_version_driver_track_layout_lap
ON public.leaderboard_times (car_class, game_version, user_id, track, layout, best_lap_ms)
WHERE user_id IS NOT NULL AND game_version IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected RECORD;
BEGIN
  FOR affected IN
    SELECT DISTINCT user_id, car_class
    FROM new_leaderboard_rows
    WHERE user_id IS NOT NULL AND car_class IS NOT NULL
  LOOP
    PERFORM public.refresh_user_class_rating(affected.user_id, affected.car_class);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_refresh_class_ratings_after_leaderboard_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_refresh_class_ratings_after_leaderboard_insert() TO service_role;
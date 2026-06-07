
-- 1. Dedupe eksisterende leaderboard_times med samme (user, track, layout, car_class, recorded_at)
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, track, COALESCE(layout,''), car_class, COALESCE(recorded_at, 'epoch'::timestamptz)
    ORDER BY best_lap_ms ASC, created_at ASC
  ) AS rn
  FROM public.leaderboard_times
)
DELETE FROM public.leaderboard_times WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Unik constraint (NULLS NOT DISTINCT så NULL layout/recorded_at også deduperes)
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_times_unique_record
  ON public.leaderboard_times (user_id, track, layout, car_class, recorded_at)
  NULLS NOT DISTINCT;

-- 3. Opdater scorings-funktion: 20/80, ingen loft, platform-wide reference
CREATE OR REPLACE FUNCTION public.compute_user_league_score(_user_id uuid, _league_id uuid, _car_class text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lb_score numeric := 50;
  res_score numeric := 50;
  combined numeric;
  user_best_ms numeric;
  median_ms numeric;
  user_avg_pos numeric;
  platform_avg_pos numeric;
  has_lb_data boolean := false;
  has_res_data boolean := false;
  league_member_count int;
BEGIN
  SELECT count(*) INTO league_member_count
    FROM public.entries
   WHERE league_id = _league_id AND car_class = _car_class;

  -- LEADERBOARD: brugerens bedste runde i klassen vs platformens median
  SELECT min(best_lap_ms) INTO user_best_ms
    FROM public.leaderboard_times
   WHERE user_id = _user_id AND car_class = _car_class;

  IF user_best_ms IS NOT NULL THEN
    has_lb_data := true;
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY bm) INTO median_ms
    FROM (
      SELECT min(best_lap_ms) AS bm
        FROM public.leaderboard_times
       WHERE car_class = _car_class
       GROUP BY user_id
    ) t;
    IF median_ms IS NOT NULL AND median_ms > 0 THEN
      lb_score := 50 + 50 * (median_ms - user_best_ms) / median_ms;
    END IF;
  END IF;

  -- RESULTATER: brugerens gennemsnitsposition vs platformens gennemsnitsposition i klassen
  SELECT avg(position) INTO user_avg_pos
    FROM public.league_results
   WHERE user_id = _user_id AND car_class = _car_class;

  IF user_avg_pos IS NOT NULL THEN
    has_res_data := true;
    SELECT avg(position) INTO platform_avg_pos
      FROM public.league_results
     WHERE car_class = _car_class;
    IF platform_avg_pos IS NOT NULL AND platform_avg_pos > 0 THEN
      res_score := 50 + 50 * (platform_avg_pos - user_avg_pos) / platform_avg_pos;
    END IF;
  END IF;

  combined := 0.2 * lb_score + 0.8 * res_score;
  -- Intet loft

  RETURN jsonb_build_object(
    'score', round(combined::numeric, 2),
    'leaderboard_score', round(lb_score::numeric, 2),
    'results_score', round(res_score::numeric, 2),
    'has_leaderboard_data', has_lb_data,
    'has_results_data', has_res_data,
    'league_member_count', league_member_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_user_league_score(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 4. Re-beregn alle eksisterende ratings med ny formel
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id, league_id, car_class FROM public.user_league_ratings LOOP
    PERFORM public.refresh_user_league_rating(r.user_id, r.league_id, r.car_class);
  END LOOP;
END $$;

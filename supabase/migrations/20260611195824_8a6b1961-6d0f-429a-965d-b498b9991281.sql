CREATE OR REPLACE FUNCTION public.compute_team_score(_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lb_score NUMERIC := 50;
  res_score NUMERIC := 50;
  combined NUMERIC;
  lb_frac NUMERIC;
  team_avg_pos NUMERIC;
  platform_avg_pos NUMERIC;
  has_lb BOOLEAN := false;
  has_res BOOLEAN := false;
BEGIN
  WITH team_bests AS (
    SELECT lt.track, lt.layout, lt.car_class, MIN(lt.best_lap_ms) AS bm
      FROM public.leaderboard_times lt
      JOIN public.team_members tm ON tm.user_id = lt.user_id
     WHERE tm.team_id = _team_id
     GROUP BY lt.track, lt.layout, lt.car_class
  ),
  all_team_bests AS (
    SELECT lt.track, lt.layout, lt.car_class, tm.team_id, MIN(lt.best_lap_ms) AS bm
      FROM public.leaderboard_times lt
      JOIN public.team_members tm ON tm.user_id = lt.user_id
     GROUP BY lt.track, lt.layout, lt.car_class, tm.team_id
  ),
  medians AS (
    SELECT track, layout, car_class,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY bm) AS med
      FROM all_team_bests
     GROUP BY track, layout, car_class
  )
  SELECT AVG((m.med - tb.bm) / NULLIF(m.med, 0))
    INTO lb_frac
    FROM team_bests tb
    JOIN medians m USING (track, layout, car_class);

  IF lb_frac IS NOT NULL THEN
    has_lb := true;
    lb_score := 50 + 50 * lb_frac;
  END IF;

  WITH team_race_pos AS (
    SELECT lr.league_id, lr.round, lr.car_class, MIN(lr.position) AS pos
      FROM public.league_results lr
      JOIN public.entries e
        ON e.user_id = lr.user_id
       AND e.league_id = lr.league_id
       AND e.car_class = lr.car_class
     WHERE e.team_id = _team_id
       AND lr.position IS NOT NULL
     GROUP BY lr.league_id, lr.round, lr.car_class
  )
  SELECT AVG(pos) INTO team_avg_pos FROM team_race_pos;

  IF team_avg_pos IS NOT NULL THEN
    has_res := true;
    WITH all_team_race_pos AS (
      SELECT lr.league_id, lr.round, lr.car_class, e.team_id, MIN(lr.position) AS pos
        FROM public.league_results lr
        JOIN public.entries e
          ON e.user_id = lr.user_id
         AND e.league_id = lr.league_id
         AND e.car_class = lr.car_class
       WHERE e.team_id IS NOT NULL
         AND lr.position IS NOT NULL
       GROUP BY lr.league_id, lr.round, lr.car_class, e.team_id
    )
    SELECT AVG(pos) INTO platform_avg_pos FROM all_team_race_pos;

    IF platform_avg_pos IS NOT NULL AND platform_avg_pos > 0 THEN
      res_score := 50 + 50 * (platform_avg_pos - team_avg_pos) / platform_avg_pos;
    END IF;
  END IF;

  combined := 0.2 * lb_score + 0.8 * res_score;

  RETURN jsonb_build_object(
    'score', round(combined::numeric, 2),
    'leaderboard_score', round(lb_score::numeric, 2),
    'results_score', round(res_score::numeric, 2),
    'has_leaderboard_data', has_lb,
    'has_results_data', has_res
  );
END;
$function$;
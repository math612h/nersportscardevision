CREATE INDEX IF NOT EXISTS idx_leaderboard_times_class_version_group
  ON public.leaderboard_times (car_class, game_version, track, layout, user_id, best_lap_ms)
  WHERE user_id IS NOT NULL AND game_version IS NOT NULL;

CREATE OR REPLACE FUNCTION public.compute_user_class_score(_user_id UUID, _car_class TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lb_score NUMERIC := 50;
  res_score NUMERIC := 50;
  combined NUMERIC;
  user_avg_pos NUMERIC;
  platform_avg_pos NUMERIC;
  has_lb BOOLEAN := false;
  has_res BOOLEAN := false;
  lb_version_count INTEGER := 0;
  lb_group_count INTEGER := 0;
BEGIN
  WITH valid_versions AS (
    SELECT lt.game_version
    FROM public.leaderboard_times lt
    WHERE lt.car_class = _car_class
      AND lt.game_version IS NOT NULL
      AND btrim(lt.game_version) <> ''
      AND btrim(lt.game_version) ~ '^[0-9]+([.][0-9]+)*$'
    GROUP BY lt.game_version
    ORDER BY regexp_split_to_array(btrim(lt.game_version), '[.]')::integer[] DESC
    LIMIT 4
  ), best_per_driver AS (
    SELECT
      lt.game_version,
      lt.track,
      coalesce(lt.layout, '') AS layout_key,
      lt.user_id,
      min(lt.best_lap_ms) AS best_lap_ms
    FROM public.leaderboard_times lt
    JOIN valid_versions vv ON vv.game_version = lt.game_version
    WHERE lt.car_class = _car_class
      AND lt.user_id IS NOT NULL
    GROUP BY lt.game_version, lt.track, coalesce(lt.layout, ''), lt.user_id
  ), ranked AS (
    SELECT
      b.*,
      count(*) OVER (
        PARTITION BY b.game_version, b.track, b.layout_key
      ) AS group_size,
      percent_rank() OVER (
        PARTITION BY b.game_version, b.track, b.layout_key
        ORDER BY b.best_lap_ms DESC
      ) * 100 AS relative_score
    FROM best_per_driver b
  ), per_version AS (
    SELECT
      r.game_version,
      avg(r.relative_score) AS version_score,
      count(*) AS group_count
    FROM ranked r
    WHERE r.user_id = _user_id
      AND r.group_size >= 2
    GROUP BY r.game_version
  )
  SELECT avg(version_score), count(*), coalesce(sum(group_count), 0)
    INTO lb_score, lb_version_count, lb_group_count
  FROM per_version;

  IF lb_version_count > 0 THEN
    has_lb := true;
  ELSE
    lb_score := 50;
  END IF;

  SELECT avg(position) INTO user_avg_pos
    FROM public.league_results
   WHERE user_id = _user_id
     AND car_class = _car_class
     AND session_type = 'race';

  IF user_avg_pos IS NOT NULL THEN
    has_res := true;
    SELECT avg(position) INTO platform_avg_pos
      FROM public.league_results
     WHERE car_class = _car_class
       AND session_type = 'race';
    IF platform_avg_pos IS NOT NULL AND platform_avg_pos > 0 THEN
      res_score := 50 + 50 * (platform_avg_pos - user_avg_pos) / platform_avg_pos;
    END IF;
  END IF;

  combined := CASE
    WHEN has_lb AND has_res THEN 0.2 * lb_score + 0.8 * res_score
    WHEN has_lb THEN lb_score
    WHEN has_res THEN res_score
    ELSE 50
  END;

  RETURN jsonb_build_object(
    'score', round(combined::numeric, 2),
    'leaderboard_score', round(lb_score::numeric, 2),
    'results_score', round(res_score::numeric, 2),
    'has_leaderboard_data', has_lb,
    'has_results_data', has_res,
    'leaderboard_version_count', lb_version_count,
    'leaderboard_group_count', lb_group_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_user_class_rating(_user_id UUID, _car_class TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c JSONB;
  conf NUMERIC;
  version_count INTEGER;
  group_count INTEGER;
BEGIN
  c := public.compute_user_class_score(_user_id, _car_class);
  version_count := coalesce((c->>'leaderboard_version_count')::integer, 0);
  group_count := coalesce((c->>'leaderboard_group_count')::integer, 0);
  conf := CASE
    WHEN NOT (c->>'has_leaderboard_data')::boolean AND NOT (c->>'has_results_data')::boolean THEN 0
    WHEN (c->>'has_leaderboard_data')::boolean THEN least(1.0, 0.25 * version_count + 0.05 * least(group_count, 5))
    ELSE 0.5
  END;

  INSERT INTO public.user_class_ratings (user_id, car_class, score, confidence, components, updated_at)
  VALUES (_user_id, _car_class, (c->>'score')::numeric, conf, c, now())
  ON CONFLICT (user_id, car_class)
  DO UPDATE SET
    score = EXCLUDED.score,
    confidence = EXCLUDED.confidence,
    components = EXCLUDED.components,
    updated_at = now();

  PERFORM public.refresh_class_percentiles(_car_class);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_user_class_ratings(_car_class TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  c JSONB;
  conf NUMERIC;
  version_count INTEGER;
  group_count INTEGER;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id
    FROM (
      SELECT user_id FROM public.leaderboard_times WHERE car_class = _car_class AND user_id IS NOT NULL
      UNION
      SELECT user_id FROM public.league_results WHERE car_class = _car_class AND user_id IS NOT NULL
      UNION
      SELECT user_id FROM public.entries WHERE car_class = _car_class AND user_id IS NOT NULL
    ) users
  LOOP
    c := public.compute_user_class_score(r.user_id, _car_class);
    version_count := coalesce((c->>'leaderboard_version_count')::integer, 0);
    group_count := coalesce((c->>'leaderboard_group_count')::integer, 0);
    conf := CASE
      WHEN NOT (c->>'has_leaderboard_data')::boolean AND NOT (c->>'has_results_data')::boolean THEN 0
      WHEN (c->>'has_leaderboard_data')::boolean THEN least(1.0, 0.25 * version_count + 0.05 * least(group_count, 5))
      ELSE 0.5
    END;

    INSERT INTO public.user_class_ratings (user_id, car_class, score, confidence, components, updated_at)
    VALUES (r.user_id, _car_class, (c->>'score')::numeric, conf, c, now())
    ON CONFLICT (user_id, car_class)
    DO UPDATE SET
      score = EXCLUDED.score,
      confidence = EXCLUDED.confidence,
      components = EXCLUDED.components,
      updated_at = now();
  END LOOP;

  PERFORM public.refresh_class_percentiles(_car_class);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cc TEXT;
BEGIN
  FOR cc IN SELECT DISTINCT car_class FROM new_leaderboard_rows WHERE car_class IS NOT NULL LOOP
    PERFORM public.refresh_all_user_class_ratings(cc);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cc TEXT;
BEGIN
  FOR cc IN
    SELECT car_class FROM new_leaderboard_rows WHERE car_class IS NOT NULL
    UNION
    SELECT car_class FROM old_leaderboard_rows WHERE car_class IS NOT NULL
  LOOP
    PERFORM public.refresh_all_user_class_ratings(cc);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cc TEXT;
BEGIN
  FOR cc IN SELECT DISTINCT car_class FROM old_leaderboard_rows WHERE car_class IS NOT NULL LOOP
    PERFORM public.refresh_all_user_class_ratings(cc);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_rating_on_leaderboard ON public.leaderboard_times;
DROP TRIGGER IF EXISTS trg_class_ratings_after_leaderboard_insert ON public.leaderboard_times;
DROP TRIGGER IF EXISTS trg_class_ratings_after_leaderboard_update ON public.leaderboard_times;
DROP TRIGGER IF EXISTS trg_class_ratings_after_leaderboard_delete ON public.leaderboard_times;

CREATE TRIGGER trg_class_ratings_after_leaderboard_insert
AFTER INSERT ON public.leaderboard_times
REFERENCING NEW TABLE AS new_leaderboard_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_insert();

CREATE TRIGGER trg_class_ratings_after_leaderboard_update
AFTER UPDATE ON public.leaderboard_times
REFERENCING OLD TABLE AS old_leaderboard_rows NEW TABLE AS new_leaderboard_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_update();

CREATE TRIGGER trg_class_ratings_after_leaderboard_delete
AFTER DELETE ON public.leaderboard_times
REFERENCING OLD TABLE AS old_leaderboard_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_class_ratings_after_leaderboard_delete();

DO $$
DECLARE cc TEXT;
BEGIN
  FOR cc IN
    SELECT DISTINCT car_class FROM (
      SELECT car_class FROM public.leaderboard_times
      UNION
      SELECT car_class FROM public.league_results
      UNION
      SELECT car_class FROM public.entries
    ) classes
    WHERE car_class IS NOT NULL
  LOOP
    PERFORM public.refresh_all_user_class_ratings(cc);
  END LOOP;
END $$;
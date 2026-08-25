CREATE OR REPLACE FUNCTION public.lmu_game_version_sort_key(_version TEXT)
RETURNS INTEGER[]
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(_version) !~ '^[0-9]+([.][0-9]+)*$' THEN ARRAY[]::integer[]
    WHEN array_length(string_to_array(btrim(_version), '.'), 1) = 2
      AND length(split_part(btrim(_version), '.', 2)) = 4
    THEN ARRAY[
      split_part(btrim(_version), '.', 1)::integer,
      substring(split_part(btrim(_version), '.', 2), 1, 1)::integer,
      substring(split_part(btrim(_version), '.', 2), 2, 1)::integer,
      substring(split_part(btrim(_version), '.', 2), 3, 1)::integer,
      substring(split_part(btrim(_version), '.', 2), 4, 1)::integer
    ]
    ELSE regexp_split_to_array(btrim(_version), '[.]')::integer[]
  END
$$;

REVOKE ALL ON FUNCTION public.lmu_game_version_sort_key(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lmu_game_version_sort_key(TEXT) TO service_role;

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
    ORDER BY public.lmu_game_version_sort_key(lt.game_version) DESC
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

REVOKE ALL ON FUNCTION public.compute_user_class_score(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_user_class_score(UUID, TEXT) TO service_role;

DO $$
DECLARE cc TEXT;
BEGIN
  FOR cc IN SELECT DISTINCT car_class FROM public.user_class_ratings WHERE car_class IS NOT NULL LOOP
    PERFORM public.refresh_all_user_class_ratings(cc);
  END LOOP;
END $$;
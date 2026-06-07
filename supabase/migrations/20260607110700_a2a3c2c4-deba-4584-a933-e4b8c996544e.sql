
-- Compute leaderboard component (0-100): user's best lap in car_class vs others
CREATE OR REPLACE FUNCTION public.compute_user_league_score(
  _user_id uuid,
  _league_id uuid,
  _car_class text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lb_score numeric := 50;
  res_score numeric := 50;
  combined numeric;
  user_best_ms numeric;
  league_member_count int;
  data_count int;
  median_ms numeric;
  user_avg_pos numeric;
  league_avg_pos numeric;
  max_pos numeric;
  has_lb_data boolean := false;
  has_res_data boolean := false;
BEGIN
  -- Count league members
  SELECT count(*) INTO league_member_count
    FROM public.entries
   WHERE league_id = _league_id AND car_class = _car_class;

  -- LEADERBOARD COMPONENT
  -- User's best lap in this car_class (any track, any source)
  SELECT min(best_lap_ms) INTO user_best_ms
    FROM public.leaderboard_times
   WHERE user_id = _user_id AND car_class = _car_class;

  IF user_best_ms IS NOT NULL THEN
    has_lb_data := true;

    -- Count other league members with data
    SELECT count(DISTINCT lt.user_id) INTO data_count
      FROM public.leaderboard_times lt
      JOIN public.entries e ON e.user_id = lt.user_id AND e.league_id = _league_id
     WHERE lt.car_class = _car_class
       AND lt.user_id <> _user_id;

    IF data_count >= 3 THEN
      -- Rank user against league members
      WITH best_per_user AS (
        SELECT lt.user_id, min(lt.best_lap_ms) AS bm
          FROM public.leaderboard_times lt
          JOIN public.entries e ON e.user_id = lt.user_id AND e.league_id = _league_id
         WHERE lt.car_class = _car_class
         GROUP BY lt.user_id
      ), with_self AS (
        SELECT bm FROM best_per_user
        UNION ALL SELECT user_best_ms
      )
      SELECT
        CASE WHEN (max(bm) - min(bm)) = 0 THEN 50
             ELSE 100 * (max(bm) - user_best_ms)::numeric / (max(bm) - min(bm))::numeric
        END
      INTO lb_score
      FROM with_self;
    ELSE
      -- Fallback: platform-wide median for this car_class
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY bm) INTO median_ms
      FROM (
        SELECT min(best_lap_ms) AS bm
          FROM public.leaderboard_times
         WHERE car_class = _car_class
         GROUP BY user_id
      ) t;
      IF median_ms IS NOT NULL AND median_ms > 0 THEN
        -- Score relative to median: better than median => >50
        lb_score := greatest(0, least(100, 50 + 50 * (median_ms - user_best_ms) / median_ms));
      END IF;
    END IF;
  END IF;

  -- RESULTS COMPONENT
  SELECT avg(position) INTO user_avg_pos
    FROM public.league_results
   WHERE user_id = _user_id AND league_id = _league_id AND car_class = _car_class;

  IF user_avg_pos IS NOT NULL THEN
    has_res_data := true;
    SELECT max(position) INTO max_pos
      FROM public.league_results
     WHERE league_id = _league_id AND car_class = _car_class;
    IF max_pos IS NULL OR max_pos <= 1 THEN
      res_score := 50;
    ELSE
      res_score := 100 * (max_pos - user_avg_pos) / (max_pos - 1);
    END IF;
  ELSE
    -- Fallback: average across other leagues for same car_class
    SELECT avg(position) INTO user_avg_pos
      FROM public.league_results
     WHERE user_id = _user_id AND car_class = _car_class;
    IF user_avg_pos IS NOT NULL THEN
      has_res_data := true;
      SELECT max(position) INTO max_pos
        FROM public.league_results
       WHERE car_class = _car_class;
      IF max_pos IS NULL OR max_pos <= 1 THEN
        res_score := 50;
      ELSE
        res_score := 100 * (max_pos - user_avg_pos) / (max_pos - 1);
      END IF;
    END IF;
  END IF;

  combined := 0.4 * lb_score + 0.6 * res_score;
  combined := greatest(0, least(100, combined));

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

-- Upsert into user_league_ratings
CREATE OR REPLACE FUNCTION public.refresh_user_league_rating(
  _user_id uuid,
  _league_id uuid,
  _car_class text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c jsonb;
  confidence_val numeric;
BEGIN
  c := public.compute_user_league_score(_user_id, _league_id, _car_class);
  confidence_val := CASE
    WHEN (c->>'has_leaderboard_data')::boolean AND (c->>'has_results_data')::boolean THEN 1.0
    WHEN (c->>'has_leaderboard_data')::boolean OR (c->>'has_results_data')::boolean THEN 0.5
    ELSE 0.0
  END;
  INSERT INTO public.user_league_ratings (user_id, league_id, car_class, score, confidence, components, updated_at)
  VALUES (_user_id, _league_id, _car_class, (c->>'score')::numeric, confidence_val, c, now())
  ON CONFLICT (user_id, league_id, car_class)
  DO UPDATE SET
    score = EXCLUDED.score,
    confidence = EXCLUDED.confidence,
    components = EXCLUDED.components,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_user_league_rating(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Allowed driver_categories for a (user, league, car_class)
CREATE OR REPLACE FUNCTION public.allowed_categories_for_signup(
  _user_id uuid,
  _league_id uuid,
  _car_class text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_score numeric;
  cfg jsonb;
  categories text[];
  cat text;
  best_cat text;
  best_diff numeric := NULL;
  cat_median numeric;
  cat_score_count int;
  result jsonb := '[]'::jsonb;
  reasoning jsonb := '{}'::jsonb;
BEGIN
  -- Compute the user's score (will create a temp evaluation, but don't persist)
  user_score := ((public.compute_user_league_score(_user_id, _league_id, _car_class))->>'score')::numeric;

  -- Get categories available for this car_class in this league
  SELECT array_agg(DISTINCT (c->>'driver_category'))
    INTO categories
  FROM public.leagues l, jsonb_array_elements(l.class_configs) c
  WHERE l.id = _league_id AND c->>'car_class' = _car_class
    AND c->>'driver_category' IS NOT NULL;

  IF categories IS NULL OR array_length(categories, 1) IS NULL THEN
    RETURN jsonb_build_object('allowed', '[]'::jsonb, 'reason', 'no_categories', 'user_score', user_score);
  END IF;

  -- If only one category, allow it
  IF array_length(categories, 1) = 1 THEN
    RETURN jsonb_build_object('allowed', to_jsonb(categories), 'reason', 'single_category', 'user_score', user_score);
  END IF;

  -- For each category, compute median score of existing entries
  FOREACH cat IN ARRAY categories LOOP
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY r.score)
      INTO cat_score_count, cat_median
    FROM public.entries e
    LEFT JOIN public.user_league_ratings r
      ON r.user_id = e.user_id AND r.league_id = e.league_id AND r.car_class = _car_class
    WHERE e.league_id = _league_id
      AND e.car_class = _car_class
      AND e.driver_category = cat
      AND e.waitlist = false
      AND e.user_id <> _user_id;

    reasoning := reasoning || jsonb_build_object(cat, jsonb_build_object('count', cat_score_count, 'median', cat_median));

    IF cat_median IS NOT NULL AND cat_score_count >= 2 THEN
      IF best_diff IS NULL OR abs(user_score - cat_median) < best_diff THEN
        best_diff := abs(user_score - cat_median);
        best_cat := cat;
      END IF;
    END IF;
  END LOOP;

  IF best_cat IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', jsonb_build_array(best_cat),
      'reason', 'algorithm',
      'user_score', user_score,
      'reasoning', reasoning
    );
  END IF;

  -- Not enough data -> allow all
  RETURN jsonb_build_object(
    'allowed', to_jsonb(categories),
    'reason', 'insufficient_data',
    'user_score', user_score,
    'reasoning', reasoning
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allowed_categories_for_signup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Trigger: refresh affected user's rating when league_results changes
CREATE OR REPLACE FUNCTION public.trg_refresh_rating_on_league_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user uuid;
  affected_league uuid;
  affected_class text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_user := OLD.user_id; affected_league := OLD.league_id; affected_class := OLD.car_class;
  ELSE
    affected_user := NEW.user_id; affected_league := NEW.league_id; affected_class := NEW.car_class;
  END IF;
  PERFORM public.refresh_user_league_rating(affected_user, affected_league, affected_class);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_refresh_rating_on_league_results() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_league_results_refresh_rating ON public.league_results;
CREATE TRIGGER trg_league_results_refresh_rating
AFTER INSERT OR UPDATE OR DELETE ON public.league_results
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_rating_on_league_results();

-- Trigger: refresh user's rating when league-sourced leaderboard time arrives
CREATE OR REPLACE FUNCTION public.trg_refresh_rating_on_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e RECORD;
BEGIN
  -- Refresh rating for every league this user is in for this car_class
  FOR e IN
    SELECT DISTINCT league_id FROM public.entries
     WHERE user_id = NEW.user_id AND car_class = NEW.car_class AND league_id IS NOT NULL
  LOOP
    PERFORM public.refresh_user_league_rating(NEW.user_id, e.league_id, NEW.car_class);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_refresh_rating_on_leaderboard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_leaderboard_times_refresh_rating ON public.leaderboard_times;
CREATE TRIGGER trg_leaderboard_times_refresh_rating
AFTER INSERT ON public.leaderboard_times
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_rating_on_leaderboard();

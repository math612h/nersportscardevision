
-- 1. user_class_ratings: en samlet rating pr. bruger pr. bilklasse
CREATE TABLE IF NOT EXISTS public.user_class_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  car_class TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 50,
  percentile NUMERIC,  -- 0..100, hvor 100 = bedst
  confidence NUMERIC NOT NULL DEFAULT 0,
  components JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, car_class)
);

GRANT SELECT ON public.user_class_ratings TO anon, authenticated;
GRANT ALL ON public.user_class_ratings TO service_role;

ALTER TABLE public.user_class_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Class ratings are public" ON public.user_class_ratings;
CREATE POLICY "Class ratings are public"
  ON public.user_class_ratings FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_user_class_ratings_class ON public.user_class_ratings(car_class);
CREATE INDEX IF NOT EXISTS idx_user_class_ratings_user ON public.user_class_ratings(user_id);

-- 2. Compute samlet klasse-score for en bruger (aggregeret på tværs af alle ligaer)
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
  user_best_ms NUMERIC;
  median_ms NUMERIC;
  user_avg_pos NUMERIC;
  platform_avg_pos NUMERIC;
  has_lb BOOLEAN := false;
  has_res BOOLEAN := false;
BEGIN
  -- Leaderboard: brugerens bedste runde vs platform-median i klassen
  SELECT min(best_lap_ms) INTO user_best_ms
    FROM public.leaderboard_times
   WHERE user_id = _user_id AND car_class = _car_class;

  IF user_best_ms IS NOT NULL THEN
    has_lb := true;
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

  -- Resultater: brugerens gennemsnitsposition vs platformens (tværs af alle ligaer)
  SELECT avg(position) INTO user_avg_pos
    FROM public.league_results
   WHERE user_id = _user_id AND car_class = _car_class;

  IF user_avg_pos IS NOT NULL THEN
    has_res := true;
    SELECT avg(position) INTO platform_avg_pos
      FROM public.league_results
     WHERE car_class = _car_class;
    IF platform_avg_pos IS NOT NULL AND platform_avg_pos > 0 THEN
      res_score := 50 + 50 * (platform_avg_pos - user_avg_pos) / platform_avg_pos;
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
$$;

-- 3. Recompute percentiler for hele klassen
CREATE OR REPLACE FUNCTION public.refresh_class_percentiles(_car_class TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT id, percent_rank() OVER (ORDER BY score) * 100 AS p
      FROM public.user_class_ratings
     WHERE car_class = _car_class
  )
  UPDATE public.user_class_ratings r
     SET percentile = round(ranked.p::numeric, 2),
         updated_at = now()
    FROM ranked
   WHERE r.id = ranked.id;
END;
$$;

-- 4. Refresh en enkelt brugers klasse-rating (+ percentiler for hele klassen)
CREATE OR REPLACE FUNCTION public.refresh_user_class_rating(_user_id UUID, _car_class TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c JSONB;
  conf NUMERIC;
BEGIN
  c := public.compute_user_class_score(_user_id, _car_class);
  conf := CASE
    WHEN (c->>'has_leaderboard_data')::boolean AND (c->>'has_results_data')::boolean THEN 1.0
    WHEN (c->>'has_leaderboard_data')::boolean OR (c->>'has_results_data')::boolean THEN 0.5
    ELSE 0.0
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

-- 5. Triggers: opdater class-rating når relevant data ændres
CREATE OR REPLACE FUNCTION public.trg_refresh_class_rating_on_leaderboard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_user_class_rating(NEW.user_id, NEW.car_class);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_class_rating_on_results()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u UUID; cc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN u := OLD.user_id; cc := OLD.car_class;
  ELSE u := NEW.user_id; cc := NEW.car_class;
  END IF;
  PERFORM public.refresh_user_class_rating(u, cc);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_class_rating_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.car_class IS NOT NULL THEN
    PERFORM public.refresh_user_class_rating(NEW.user_id, NEW.car_class);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_rating_on_leaderboard ON public.leaderboard_times;
CREATE TRIGGER trg_class_rating_on_leaderboard
  AFTER INSERT OR UPDATE ON public.leaderboard_times
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_class_rating_on_leaderboard();

DROP TRIGGER IF EXISTS trg_class_rating_on_results ON public.league_results;
CREATE TRIGGER trg_class_rating_on_results
  AFTER INSERT OR UPDATE OR DELETE ON public.league_results
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_class_rating_on_results();

DROP TRIGGER IF EXISTS trg_class_rating_on_entry ON public.entries;
CREATE TRIGGER trg_class_rating_on_entry
  AFTER INSERT ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_class_rating_on_entry();

-- 6. Backfill: opret klasse-ratings for alle eksisterende (user, car_class)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, car_class FROM (
      SELECT user_id, car_class FROM public.leaderboard_times WHERE user_id IS NOT NULL
      UNION
      SELECT user_id, car_class FROM public.league_results WHERE user_id IS NOT NULL
      UNION
      SELECT user_id, car_class FROM public.entries WHERE user_id IS NOT NULL AND car_class IS NOT NULL
    ) s
  LOOP
    PERFORM public.refresh_user_class_rating(r.user_id, r.car_class);
  END LOOP;
END $$;

-- 7. allowed_categories_for_signup bruger nu samlet klasse-score (compute on the fly bevarer eksisterende signatur)
CREATE OR REPLACE FUNCTION public.allowed_categories_for_signup(_user_id UUID, _league_id UUID, _car_class TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_score NUMERIC;
  categories TEXT[];
  cat TEXT;
  best_cat TEXT;
  best_diff NUMERIC := NULL;
  cat_median NUMERIC;
  cat_score_count INT;
  reasoning JSONB := '{}'::jsonb;
BEGIN
  -- Brugerens samlede klasse-score
  user_score := ((public.compute_user_class_score(_user_id, _car_class))->>'score')::numeric;

  SELECT array_agg(DISTINCT (c->>'driver_category'))
    INTO categories
  FROM public.leagues l, jsonb_array_elements(l.class_configs) c
  WHERE l.id = _league_id AND c->>'car_class' = _car_class
    AND c->>'driver_category' IS NOT NULL;

  IF categories IS NULL OR array_length(categories, 1) IS NULL THEN
    RETURN jsonb_build_object('allowed', '[]'::jsonb, 'reason', 'no_categories', 'user_score', user_score);
  END IF;

  IF array_length(categories, 1) = 1 THEN
    RETURN jsonb_build_object('allowed', to_jsonb(categories), 'reason', 'single_category', 'user_score', user_score);
  END IF;

  FOREACH cat IN ARRAY categories LOOP
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY r.score)
      INTO cat_score_count, cat_median
    FROM public.entries e
    LEFT JOIN public.user_class_ratings r
      ON r.user_id = e.user_id AND r.car_class = _car_class
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

  RETURN jsonb_build_object(
    'allowed', to_jsonb(categories),
    'reason', 'insufficient_data',
    'user_score', user_score,
    'reasoning', reasoning
  );
END;
$$;

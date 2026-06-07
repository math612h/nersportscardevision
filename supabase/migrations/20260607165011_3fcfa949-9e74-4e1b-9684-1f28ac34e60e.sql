-- ============================================
-- ÉN SAMLET ELO PR. BRUGER MED RIGTIG ELO-FORMEL
-- ============================================

-- 1) Hovedtabel: én rating pr. bruger
CREATE TABLE IF NOT EXISTS public.user_ratings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 1500,
  races_count INT NOT NULL DEFAULT 0,
  percentile NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_ratings TO authenticated, anon;
GRANT ALL ON public.user_ratings TO service_role;

ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ratings"
  ON public.user_ratings FOR SELECT
  TO authenticated, anon
  USING (true);

-- 2) Historik for ELO-udvikling
CREATE TABLE IF NOT EXISTS public.user_rating_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  delta NUMERIC,
  league_id UUID,
  round INT,
  car_class TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_rating_history TO authenticated;
GRANT ALL ON public.user_rating_history TO service_role;

ALTER TABLE public.user_rating_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rating history"
  ON public.user_rating_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_rating_history_user_time
  ON public.user_rating_history (user_id, recorded_at);

-- 3) Percentile-opdatering (globalt på tværs af alle brugere)
CREATE OR REPLACE FUNCTION public.refresh_user_rating_percentiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT user_id, percent_rank() OVER (ORDER BY score) * 100 AS p
      FROM public.user_ratings
  )
  UPDATE public.user_ratings r
     SET percentile = round(ranked.p::numeric, 2)
    FROM ranked
   WHERE r.user_id = ranked.user_id;
END;
$$;

-- 4) Replay: nulstil og kør alle league_results igennem i kronologisk rækkefølge
--    Pairwise ELO med K=32 (<30 løb) / K=16 (>=30 løb), basis 1500.
CREATE OR REPLACE FUNCTION public.recompute_all_elo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  race RECORD;
  a RECORD;
  b RECORD;
  r_a NUMERIC; r_b NUMERIC;
  k_a NUMERIC; k_b NUMERIC;
  e_a NUMERIC; e_b NUMERIC;
  s_a NUMERIC; s_b NUMERIC;
  d_a NUMERIC; d_b NUMERIC;
  deltas JSONB;
  uid UUID;
  delta NUMERIC;
BEGIN
  -- Nulstil
  TRUNCATE public.user_rating_history;
  UPDATE public.user_ratings SET score = 1500, races_count = 0, percentile = NULL, updated_at = now();

  -- Sørg for at alle brugere med profil findes i user_ratings
  INSERT INTO public.user_ratings (user_id, score)
    SELECT p.id, 1500 FROM public.profiles p
   ON CONFLICT (user_id) DO NOTHING;

  -- Loop over hvert race (league_id, round, car_class) i kronologisk rækkefølge
  FOR race IN
    SELECT league_id, round, car_class, min(created_at) AS race_time
      FROM public.league_results
     WHERE position IS NOT NULL
     GROUP BY league_id, round, car_class
     ORDER BY race_time ASC
  LOOP
    deltas := '{}'::jsonb;

    -- Pairwise sammenligning af alle deltagere i racet
    FOR a IN
      SELECT lr.user_id, lr.position, ur.score, ur.races_count
        FROM public.league_results lr
        JOIN public.user_ratings ur ON ur.user_id = lr.user_id
       WHERE lr.league_id = race.league_id
         AND lr.round IS NOT DISTINCT FROM race.round
         AND lr.car_class = race.car_class
         AND lr.position IS NOT NULL
    LOOP
      FOR b IN
        SELECT lr.user_id, lr.position, ur.score, ur.races_count
          FROM public.league_results lr
          JOIN public.user_ratings ur ON ur.user_id = lr.user_id
         WHERE lr.league_id = race.league_id
           AND lr.round IS NOT DISTINCT FROM race.round
           AND lr.car_class = race.car_class
           AND lr.position IS NOT NULL
           AND lr.user_id > a.user_id
      LOOP
        r_a := a.score; r_b := b.score;
        k_a := CASE WHEN a.races_count < 30 THEN 32 ELSE 16 END;
        k_b := CASE WHEN b.races_count < 30 THEN 32 ELSE 16 END;
        e_a := 1.0 / (1.0 + power(10, (r_b - r_a) / 400.0));
        e_b := 1.0 - e_a;
        IF a.position < b.position THEN
          s_a := 1; s_b := 0;
        ELSIF a.position > b.position THEN
          s_a := 0; s_b := 1;
        ELSE
          s_a := 0.5; s_b := 0.5;
        END IF;
        d_a := k_a * (s_a - e_a);
        d_b := k_b * (s_b - e_b);

        deltas := jsonb_set(
          deltas,
          ARRAY[a.user_id::text],
          to_jsonb(COALESCE((deltas->>a.user_id::text)::numeric, 0) + d_a)
        );
        deltas := jsonb_set(
          deltas,
          ARRAY[b.user_id::text],
          to_jsonb(COALESCE((deltas->>b.user_id::text)::numeric, 0) + d_b)
        );
      END LOOP;
    END LOOP;

    -- Anvend delta'er + log historik + tæl racet med
    FOR uid, delta IN
      SELECT key::uuid, value::text::numeric FROM jsonb_each_text(deltas)
    LOOP
      UPDATE public.user_ratings
         SET score = score + delta,
             races_count = races_count + 1,
             updated_at = now()
       WHERE user_id = uid;

      INSERT INTO public.user_rating_history (user_id, score, delta, league_id, round, car_class, recorded_at)
      SELECT uid, score, delta, race.league_id, race.round, race.car_class, race.race_time
        FROM public.user_ratings WHERE user_id = uid;
    END LOOP;
  END LOOP;

  PERFORM public.refresh_user_rating_percentiles();
END;
$$;

-- 5) Trigger: enhver ændring i league_results trigger fuldt replay
CREATE OR REPLACE FUNCTION public.trg_recompute_elo_on_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_all_elo();
  RETURN NULL;
END;
$$;

-- Drop gamle klasse-baserede triggere
DROP TRIGGER IF EXISTS trg_refresh_rating_on_league_results ON public.league_results;
DROP TRIGGER IF EXISTS trg_refresh_class_rating_on_results ON public.league_results;
DROP TRIGGER IF EXISTS trg_refresh_class_rating_on_leaderboard ON public.leaderboard_times;
DROP TRIGGER IF EXISTS trg_refresh_rating_on_leaderboard ON public.leaderboard_times;
DROP TRIGGER IF EXISTS trg_refresh_class_rating_on_entry ON public.entries;
DROP TRIGGER IF EXISTS trg_refresh_rating_on_entry ON public.entries;

-- Ny trigger (statement-level for at undgå at køre N gange ved batch insert)
CREATE TRIGGER trg_recompute_elo_on_results_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.league_results
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_recompute_elo_on_results();

-- 6) Seed: alle eksisterende brugere på 1500
INSERT INTO public.user_ratings (user_id, score)
  SELECT id, 1500 FROM public.profiles
 ON CONFLICT (user_id) DO NOTHING;

SELECT public.refresh_user_rating_percentiles();

-- 7) Opdater allowed_categories_for_signup til at bruge overall rating
CREATE OR REPLACE FUNCTION public.allowed_categories_for_signup(_user_id uuid, _league_id uuid, _car_class text)
RETURNS jsonb
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
  SELECT COALESCE(score, 1500) INTO user_score
    FROM public.user_ratings WHERE user_id = _user_id;
  IF user_score IS NULL THEN user_score := 1500; END IF;

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
    LEFT JOIN public.user_ratings r ON r.user_id = e.user_id
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
    RETURN jsonb_build_object('allowed', jsonb_build_array(best_cat), 'reason', 'algorithm', 'user_score', user_score, 'reasoning', reasoning);
  END IF;

  RETURN jsonb_build_object('allowed', to_jsonb(categories), 'reason', 'insufficient_data', 'user_score', user_score, 'reasoning', reasoning);
END;
$$;

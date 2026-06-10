
-- 1. Table
CREATE TABLE public.team_ratings (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 50,
  percentile NUMERIC,
  confidence NUMERIC NOT NULL DEFAULT 0,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_ratings TO anon;
GRANT SELECT ON public.team_ratings TO authenticated;
GRANT ALL ON public.team_ratings TO service_role;

ALTER TABLE public.team_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_ratings readable by everyone"
  ON public.team_ratings FOR SELECT
  USING (true);

-- 2. Compute team score (pooled across all classes)
CREATE OR REPLACE FUNCTION public.compute_team_score(_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  -- LEADERBOARD: team's best lap per (track,layout,class) vs median of all teams
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

  -- RESULTATER: team's best position per race vs platform team avg
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
  ),
  all_team_race_pos AS (
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
  SELECT AVG(pos) INTO team_avg_pos FROM team_race_pos;

  IF team_avg_pos IS NOT NULL THEN
    has_res := true;
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
$$;

-- 3. Refresh percentile across all teams
CREATE OR REPLACE FUNCTION public.refresh_team_percentiles()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT team_id, percent_rank() OVER (ORDER BY score) * 100 AS p
      FROM public.team_ratings
  )
  UPDATE public.team_ratings r
     SET percentile = round(ranked.p::numeric, 2),
         updated_at = now()
    FROM ranked
   WHERE r.team_id = ranked.team_id;
END;
$$;

-- 4. Refresh one team
CREATE OR REPLACE FUNCTION public.refresh_team_rating(_team_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c JSONB;
  conf NUMERIC;
BEGIN
  IF _team_id IS NULL THEN RETURN; END IF;
  c := public.compute_team_score(_team_id);
  conf := CASE
    WHEN (c->>'has_leaderboard_data')::boolean AND (c->>'has_results_data')::boolean THEN 1.0
    WHEN (c->>'has_leaderboard_data')::boolean OR (c->>'has_results_data')::boolean THEN 0.5
    ELSE 0.0
  END;

  INSERT INTO public.team_ratings (team_id, score, confidence, components, updated_at)
  VALUES (_team_id, (c->>'score')::numeric, conf, c, now())
  ON CONFLICT (team_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    confidence = EXCLUDED.confidence,
    components = EXCLUDED.components,
    updated_at = now();

  PERFORM public.refresh_team_percentiles();
END;
$$;

-- 5. Recompute all teams
CREATE OR REPLACE FUNCTION public.recompute_all_team_ratings()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.teams LOOP
    PERFORM public.refresh_team_rating(t.id);
  END LOOP;
  PERFORM public.refresh_team_percentiles();
END;
$$;

-- 6. Trigger functions
CREATE OR REPLACE FUNCTION public.trg_refresh_team_rating_on_leaderboard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT team_id FROM public.team_members WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) LOOP
    PERFORM public.refresh_team_rating(r.team_id);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_team_rating_on_results()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; u UUID; lid UUID; cc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN u := OLD.user_id; lid := OLD.league_id; cc := OLD.car_class;
  ELSE u := NEW.user_id; lid := NEW.league_id; cc := NEW.car_class;
  END IF;
  FOR r IN
    SELECT DISTINCT e.team_id FROM public.entries e
     WHERE e.user_id = u AND e.league_id = lid AND e.car_class = cc AND e.team_id IS NOT NULL
  LOOP
    PERFORM public.refresh_team_rating(r.team_id);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_team_rating_on_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.team_id IS NOT NULL THEN
    PERFORM public.refresh_team_rating(NEW.team_id);
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM COALESCE(NEW.team_id, OLD.team_id) THEN
    PERFORM public.refresh_team_rating(OLD.team_id);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_team_rating_on_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_team_rating(COALESCE(NEW.team_id, OLD.team_id));
  RETURN NULL;
END $$;

-- 7. Triggers
DROP TRIGGER IF EXISTS team_rating_on_leaderboard ON public.leaderboard_times;
CREATE TRIGGER team_rating_on_leaderboard
  AFTER INSERT OR UPDATE OR DELETE ON public.leaderboard_times
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_team_rating_on_leaderboard();

DROP TRIGGER IF EXISTS team_rating_on_results ON public.league_results;
CREATE TRIGGER team_rating_on_results
  AFTER INSERT OR UPDATE OR DELETE ON public.league_results
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_team_rating_on_results();

DROP TRIGGER IF EXISTS team_rating_on_entry ON public.entries;
CREATE TRIGGER team_rating_on_entry
  AFTER INSERT OR UPDATE OR DELETE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_team_rating_on_entry();

DROP TRIGGER IF EXISTS team_rating_on_member ON public.team_members;
CREATE TRIGGER team_rating_on_member
  AFTER INSERT OR UPDATE OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_team_rating_on_member();

-- 8. Initial compute
SELECT public.recompute_all_team_ratings();

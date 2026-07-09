
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

  SELECT avg(position) INTO user_avg_pos
    FROM public.league_results
   WHERE user_id = _user_id
     AND car_class = _car_class
     AND session_type = 'race';

  IF user_avg_pos IS NOT NULL THEN
    has_res_data := true;
    SELECT avg(position) INTO platform_avg_pos
      FROM public.league_results
     WHERE car_class = _car_class
       AND session_type = 'race';
    IF platform_avg_pos IS NOT NULL AND platform_avg_pos > 0 THEN
      res_score := 50 + 50 * (platform_avg_pos - user_avg_pos) / platform_avg_pos;
    END IF;
  END IF;

  combined := 0.2 * lb_score + 0.8 * res_score;

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

CREATE OR REPLACE FUNCTION public.recompute_all_elo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  TRUNCATE public.user_rating_history;
  UPDATE public.user_ratings SET score = 1500, races_count = 0, percentile = NULL, updated_at = now() WHERE user_id IS NOT NULL;

  INSERT INTO public.user_ratings (user_id, score)
    SELECT p.id, 1500 FROM public.profiles p
   ON CONFLICT (user_id) DO NOTHING;

  FOR race IN
    SELECT league_id, round, car_class, min(created_at) AS race_time
      FROM public.league_results
     WHERE position IS NOT NULL
       AND session_type = 'race'
     GROUP BY league_id, round, car_class
     ORDER BY race_time ASC
  LOOP
    deltas := '{}'::jsonb;

    FOR a IN
      SELECT lr.user_id, lr.position, ur.score, ur.races_count
        FROM public.league_results lr
        JOIN public.user_ratings ur ON ur.user_id = lr.user_id
       WHERE lr.league_id = race.league_id
         AND lr.round IS NOT DISTINCT FROM race.round
         AND lr.car_class = race.car_class
         AND lr.position IS NOT NULL
         AND lr.session_type = 'race'
    LOOP
      FOR b IN
        SELECT lr.user_id, lr.position, ur.score, ur.races_count
          FROM public.league_results lr
          JOIN public.user_ratings ur ON ur.user_id = lr.user_id
         WHERE lr.league_id = race.league_id
           AND lr.round IS NOT DISTINCT FROM race.round
           AND lr.car_class = race.car_class
           AND lr.position IS NOT NULL
           AND lr.session_type = 'race'
           AND lr.user_id > a.user_id
      LOOP
        r_a := a.score; r_b := b.score;
        k_a := CASE WHEN a.races_count < 5 THEN 32 ELSE 16 END;
        k_b := CASE WHEN b.races_count < 5 THEN 32 ELSE 16 END;
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
$function$;

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
  affected_session text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_user := OLD.user_id; affected_league := OLD.league_id; affected_class := OLD.car_class;
    affected_session := OLD.session_type;
  ELSE
    affected_user := NEW.user_id; affected_league := NEW.league_id; affected_class := NEW.car_class;
    affected_session := NEW.session_type;
  END IF;
  IF affected_session IS DISTINCT FROM 'race' THEN
    RETURN NULL;
  END IF;
  PERFORM public.refresh_user_league_rating(affected_user, affected_league, affected_class);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_refresh_rating_on_league_results() FROM PUBLIC, anon, authenticated;

SELECT public.recompute_all_elo();

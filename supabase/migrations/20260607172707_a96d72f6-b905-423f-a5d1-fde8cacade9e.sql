-- Opdater ELO-funktion: K=32 indtil 5 løb (i stedet for 30)
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

-- Kør en frisk genberegning så grænsen træder i kraft med det samme
SELECT public.recompute_all_elo();
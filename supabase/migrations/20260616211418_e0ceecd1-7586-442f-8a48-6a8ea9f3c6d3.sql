CREATE OR REPLACE FUNCTION public.refresh_team_rating(_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c JSONB;
  conf NUMERIC;
BEGIN
  IF _team_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id) THEN RETURN; END IF;
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
$function$;
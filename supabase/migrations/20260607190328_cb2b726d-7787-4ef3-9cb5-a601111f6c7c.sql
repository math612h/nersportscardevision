
REVOKE SELECT ON public.leaderboard_times FROM anon;
GRANT SELECT (id, driver_name, car_class, car_model, track, layout, best_lap_ms, recorded_at, created_at, source, division_id) ON public.leaderboard_times TO anon;

REVOKE SELECT ON public.league_results FROM anon;
GRANT SELECT (id, league_id, division_id, track, layout, round, car_class, car_model, position, points, best_lap_ms, avg_lap_ms, notes, created_at, updated_at) ON public.league_results TO anon;

REVOKE SELECT ON public.team_members FROM anon;
GRANT SELECT (team_id, role, created_at) ON public.team_members TO anon;

REVOKE SELECT ON public.user_class_ratings FROM anon;
GRANT SELECT (car_class, score, percentile, confidence, components, created_at, updated_at) ON public.user_class_ratings TO anon;

REVOKE SELECT ON public.user_ratings FROM anon;
GRANT SELECT (score, percentile, races_count, updated_at) ON public.user_ratings TO anon;

REVOKE SELECT ON public.leagues FROM anon;
GRANT SELECT (id, name, description, banner_url, car_class, driver_category, is_offseason, signup_opens_at, created_at, points_system, event_settings, class_configs) ON public.leagues TO anon;

REVOKE SELECT ON public.news_posts FROM anon;
GRANT SELECT (id, title, body, image_path, expires_at, created_at, updated_at) ON public.news_posts TO anon;

REVOKE SELECT ON public.points_system_templates FROM anon;
GRANT SELECT (id, name, description, points_per_position, fastest_lap_points, created_at) ON public.points_system_templates TO anon;

REVOKE SELECT ON public.ruleset_templates FROM anon;
GRANT SELECT (id, name, description, created_at) ON public.ruleset_templates TO anon;

REVOKE SELECT ON public.teams FROM anon;
GRANT SELECT (id, name, bio, logo_url, created_at, updated_at) ON public.teams TO anon;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', r.proname, r.args);
  END LOOP;
END $$;

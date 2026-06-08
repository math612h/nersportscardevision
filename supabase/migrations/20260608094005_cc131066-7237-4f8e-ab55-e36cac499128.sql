
-- Restrict anonymous SELECT to non-UUID columns via column-level grants.
-- RLS policies remain intact; column privileges prevent UUID exposure.

-- leaderboard_times
REVOKE SELECT ON public.leaderboard_times FROM anon;
GRANT SELECT (id, driver_name, car_model, car_class, best_lap_ms, track, layout, recorded_at, created_at, division_id, source) ON public.leaderboard_times TO anon;

-- league_results
REVOKE SELECT ON public.league_results FROM anon;
GRANT SELECT (id, league_id, division_id, track, layout, car_class, car_model, position, points, best_lap_ms, avg_lap_ms, round, notes, created_at, updated_at) ON public.league_results TO anon;

-- news_posts
REVOKE SELECT ON public.news_posts FROM anon;
GRANT SELECT (id, title, body, image_path, expires_at, created_at, updated_at) ON public.news_posts TO anon;

-- leagues
REVOKE SELECT ON public.leagues FROM anon;
GRANT SELECT (id, name, description, banner_url, driver_category, car_class, class_configs, event_settings, points_system, signup_opens_at, is_offseason, created_at) ON public.leagues TO anon;

-- points_system_templates
REVOKE SELECT ON public.points_system_templates FROM anon;
GRANT SELECT (id, name, description, points_per_position, fastest_lap_points, created_at) ON public.points_system_templates TO anon;

-- ruleset_templates
REVOKE SELECT ON public.ruleset_templates FROM anon;
GRANT SELECT (id, name, description, created_at) ON public.ruleset_templates TO anon;

-- team_members
REVOKE SELECT ON public.team_members FROM anon;
GRANT SELECT (id, team_id, role, created_at) ON public.team_members TO anon;

-- teams
REVOKE SELECT ON public.teams FROM anon;
GRANT SELECT (id, name, bio, logo_url, created_at, updated_at) ON public.teams TO anon;

-- user_ratings
REVOKE SELECT ON public.user_ratings FROM anon;
GRANT SELECT (score, percentile, races_count, updated_at) ON public.user_ratings TO anon;

-- user_class_ratings
REVOKE SELECT ON public.user_class_ratings FROM anon;
GRANT SELECT (id, car_class, score, percentile, confidence, components, created_at, updated_at) ON public.user_class_ratings TO anon;

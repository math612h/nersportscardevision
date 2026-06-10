
-- Restrict anon to non-UUID columns via column-level GRANTs.
-- Authenticated keeps full SELECT (granted separately).

REVOKE SELECT ON public.leaderboard_times FROM anon;
GRANT SELECT (id, driver_name, track, layout, car_class, car_model, best_lap_ms, source, division_id, recorded_at, created_at) ON public.leaderboard_times TO anon;

REVOKE SELECT ON public.league_results FROM anon;
GRANT SELECT (id, league_id, division_id, round, track, layout, car_class, car_model, best_lap_ms, avg_lap_ms, position, points, notes, created_at, updated_at) ON public.league_results TO anon;

REVOKE SELECT ON public.leagues FROM anon;
GRANT SELECT (id, name, description, banner_url, created_at, car_class, driver_category, class_configs, is_offseason, event_settings, points_system, signup_opens_at) ON public.leagues TO anon;

REVOKE SELECT ON public.news_posts FROM anon;
GRANT SELECT (id, title, body, image_path, expires_at, created_at, updated_at) ON public.news_posts TO anon;

REVOKE SELECT ON public.points_system_templates FROM anon;
GRANT SELECT (id, name, description, points_per_position, fastest_lap_points, created_at) ON public.points_system_templates TO anon;

REVOKE SELECT ON public.ruleset_templates FROM anon;
GRANT SELECT (id, name, description, created_at) ON public.ruleset_templates TO anon;

REVOKE SELECT ON public.team_members FROM anon;
GRANT SELECT (id, team_id, role, created_at) ON public.team_members TO anon;

REVOKE SELECT ON public.teams FROM anon;
GRANT SELECT (id, name, bio, logo_url, created_at, updated_at) ON public.teams TO anon;

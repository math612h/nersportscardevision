-- Fix security finding: permissive SELECT policy on division_practice_sessions
-- let anyone read lobby_code/lobby_password directly, bypassing the time-gated
-- credentials RPCs. Session metadata stays publicly readable (intended);
-- credentials are now only served via the security-definer RPCs.

REVOKE SELECT ON public.division_practice_sessions FROM anon, authenticated;

GRANT SELECT (
  id,
  division_id,
  server_name,
  has_qualifying,
  has_race,
  practice_minutes,
  qualifying_minutes,
  race_minutes,
  starts_at,
  settings,
  created_at,
  updated_at
) ON public.division_practice_sessions TO anon, authenticated;
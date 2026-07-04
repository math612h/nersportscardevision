DROP POLICY IF EXISTS "Team entries readable by anon" ON public.league_team_entries;
DROP POLICY IF EXISTS "Lineup readable by anon" ON public.league_team_lineup;
DROP POLICY IF EXISTS "Team members readable by anon" ON public.team_members;
REVOKE SELECT ON public.league_team_entries FROM anon;
REVOKE SELECT ON public.league_team_lineup FROM anon;
REVOKE SELECT ON public.team_members FROM anon;

-- Grant public (anon) read access to core viewing tables so non-logged-in users can browse the site.

-- entries: drop deny-anon, add anon SELECT, grant privilege
DROP POLICY IF EXISTS "entries_deny_anon" ON public.entries;
GRANT SELECT ON public.entries TO anon;
CREATE POLICY "Entries readable by anon" ON public.entries FOR SELECT TO anon USING (true);

-- league_results
DROP POLICY IF EXISTS "league_results_deny_anon" ON public.league_results;
GRANT SELECT ON public.league_results TO anon;
CREATE POLICY "League results readable by anon" ON public.league_results FOR SELECT TO anon USING (true);

-- leaderboard_times
DROP POLICY IF EXISTS "leaderboard_times_deny_anon" ON public.leaderboard_times;
GRANT SELECT ON public.leaderboard_times TO anon;
CREATE POLICY "Leaderboard readable by anon" ON public.leaderboard_times FOR SELECT TO anon USING (true);

-- profiles (public display data only readable; sensitive data is in profiles_private which stays locked)
DROP POLICY IF EXISTS "profiles_deny_anon" ON public.profiles;
GRANT SELECT ON public.profiles TO anon;
CREATE POLICY "Profiles readable by anon" ON public.profiles FOR SELECT TO anon USING (true);

-- team_members
GRANT SELECT ON public.team_members TO anon;
CREATE POLICY "Team members readable by anon" ON public.team_members FOR SELECT TO anon USING (true);

-- league_team_entries
GRANT SELECT ON public.league_team_entries TO anon;
CREATE POLICY "Team entries readable by anon" ON public.league_team_entries FOR SELECT TO anon USING (true);

-- league_team_lineup
GRANT SELECT ON public.league_team_lineup TO anon;
CREATE POLICY "Lineup readable by anon" ON public.league_team_lineup FOR SELECT TO anon USING (true);

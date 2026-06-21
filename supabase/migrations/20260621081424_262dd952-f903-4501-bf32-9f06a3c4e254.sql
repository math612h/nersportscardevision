DROP POLICY IF EXISTS entries_deny_anon ON public.entries;
CREATE POLICY entries_deny_anon ON public.entries AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS leaderboard_times_deny_anon ON public.leaderboard_times;
CREATE POLICY leaderboard_times_deny_anon ON public.leaderboard_times AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS league_results_deny_anon ON public.league_results;
CREATE POLICY league_results_deny_anon ON public.league_results AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS profiles_deny_anon ON public.profiles;
CREATE POLICY profiles_deny_anon ON public.profiles AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
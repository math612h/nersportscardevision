DROP POLICY IF EXISTS division_practice_sessions_deny_anon ON public.division_practice_sessions;
CREATE POLICY division_practice_sessions_deny_anon_insert ON public.division_practice_sessions AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY division_practice_sessions_deny_anon_update ON public.division_practice_sessions AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY division_practice_sessions_deny_anon_delete ON public.division_practice_sessions AS RESTRICTIVE FOR DELETE TO anon USING (false);
-- Allow public (anon) read access to leagues, divisions, rulesets and entries
GRANT SELECT ON public.leagues TO anon;
GRANT SELECT ON public.divisions TO anon;
GRANT SELECT ON public.rulesets TO anon;
GRANT SELECT ON public.entries TO anon;
GRANT SELECT ON public.profiles TO anon;

CREATE POLICY "Leagues readable by anon" ON public.leagues FOR SELECT TO anon USING (true);
CREATE POLICY "Divisions readable by anon" ON public.divisions FOR SELECT TO anon USING (true);
CREATE POLICY "Rulesets readable by anon" ON public.rulesets FOR SELECT TO anon USING (true);
CREATE POLICY "Entries readable by anon" ON public.entries FOR SELECT TO anon USING (true);
CREATE POLICY "Profiles readable by anon" ON public.profiles FOR SELECT TO anon USING (true);
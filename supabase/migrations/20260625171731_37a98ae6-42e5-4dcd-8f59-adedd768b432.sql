
-- Allow any approved league participant (individual or team lineup) to see server/practice info for all divisions in that league

DROP POLICY IF EXISTS "Approved enrolled drivers read division lobby" ON public.division_lobbies;
CREATE POLICY "Approved league participants read division lobby"
ON public.division_lobbies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    JOIN public.divisions d ON d.id = division_lobbies.division_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND e.league_id = d.league_id
      AND d.race_date IS NOT NULL
      AND d.race_date >= (now() - interval '6 hours')
      AND d.race_date <= (now() + interval '7 days')
  )
);

DROP POLICY IF EXISTS "Approved team lineup members read division lobby" ON public.division_lobbies;
CREATE POLICY "Approved team lineup members read division lobby"
ON public.division_lobbies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.league_team_lineup l
    JOIN public.league_team_entries e ON e.id = l.league_team_entry_id
    JOIN public.divisions d ON d.id = division_lobbies.division_id
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.user_id = auth.uid()
      AND p.approved = true
      AND e.status = 'confirmed'
      AND e.league_id = d.league_id
      AND d.race_date IS NOT NULL
      AND d.race_date >= (now() - interval '6 hours')
      AND d.race_date <= (now() + interval '7 days')
  )
);

DROP POLICY IF EXISTS "Approved enrolled drivers read practice sessions" ON public.division_practice_sessions;
CREATE POLICY "Approved league participants read practice sessions"
ON public.division_practice_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    JOIN public.divisions d ON d.id = division_practice_sessions.division_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND e.league_id = d.league_id
  )
  AND (starts_at IS NULL OR (starts_at <= now() + interval '14 days' AND starts_at >= now() - interval '6 hours'))
);

DROP POLICY IF EXISTS "Approved team lineup members read practice sessions" ON public.division_practice_sessions;
CREATE POLICY "Approved team lineup members read practice sessions"
ON public.division_practice_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.league_team_lineup l
    JOIN public.league_team_entries e ON e.id = l.league_team_entry_id
    JOIN public.divisions d ON d.id = division_practice_sessions.division_id
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.user_id = auth.uid()
      AND p.approved = true
      AND e.status = 'confirmed'
      AND e.league_id = d.league_id
  )
  AND (starts_at IS NULL OR (starts_at <= now() + interval '14 days' AND starts_at >= now() - interval '6 hours'))
);

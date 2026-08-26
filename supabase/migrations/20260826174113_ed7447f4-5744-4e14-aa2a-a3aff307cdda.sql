DROP POLICY IF EXISTS "Approved league participants read practice sessions" ON public.division_practice_sessions;
CREATE POLICY "Approved league participants read practice sessions"
ON public.division_practice_sessions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM entries e
  JOIN profiles p ON p.id = e.user_id
  JOIN divisions d ON d.id = division_practice_sessions.division_id
  WHERE e.user_id = auth.uid() AND p.approved = true AND e.waitlist = false AND e.league_id = d.league_id
));

DROP POLICY IF EXISTS "Approved team lineup members read practice sessions" ON public.division_practice_sessions;
CREATE POLICY "Approved team lineup members read practice sessions"
ON public.division_practice_sessions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM league_team_lineup l
  JOIN league_team_entries e ON e.id = l.league_team_entry_id
  JOIN divisions d ON d.id = division_practice_sessions.division_id
  JOIN profiles p ON p.id = l.user_id
  WHERE l.user_id = auth.uid() AND p.approved = true AND e.status = 'confirmed'::league_team_entry_status AND e.league_id = d.league_id
));
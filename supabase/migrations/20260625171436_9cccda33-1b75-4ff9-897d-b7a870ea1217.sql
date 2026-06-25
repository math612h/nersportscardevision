CREATE POLICY "Approved team lineup members read practice sessions"
ON public.division_practice_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.league_team_lineup l
    JOIN public.league_team_entries e ON e.id = l.league_team_entry_id
    JOIN public.divisions d ON d.id = division_practice_sessions.division_id
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.user_id = auth.uid()
      AND p.approved = true
      AND e.status = 'confirmed'
      AND e.league_id = d.league_id
      AND e.car_class = d.car_class
  )
  AND (
    starts_at IS NULL
    OR (starts_at <= (now() + interval '14 days') AND starts_at >= (now() - interval '6 hours'))
  )
);
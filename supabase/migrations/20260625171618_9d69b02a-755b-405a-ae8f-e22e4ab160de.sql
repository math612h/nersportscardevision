CREATE POLICY "Approved team lineup members read division lobby"
ON public.division_lobbies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.league_team_lineup l
    JOIN public.league_team_entries e ON e.id = l.league_team_entry_id
    JOIN public.divisions d ON d.id = division_lobbies.division_id
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.user_id = auth.uid()
      AND p.approved = true
      AND e.status = 'confirmed'
      AND e.league_id = d.league_id
      AND e.car_class = d.car_class
      AND d.race_date IS NOT NULL
      AND d.race_date >= (now() - interval '6 hours')
      AND d.race_date <= (now() + interval '7 days')
  )
);
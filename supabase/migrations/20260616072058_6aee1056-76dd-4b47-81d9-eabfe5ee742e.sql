DROP POLICY IF EXISTS "Approved enrolled drivers read division lobby" ON public.division_lobbies;

CREATE POLICY "Approved enrolled drivers read division lobby"
ON public.division_lobbies
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    JOIN public.divisions d ON d.id = e.division_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND e.division_id = division_lobbies.division_id
      AND d.race_date IS NOT NULL
      AND d.race_date >= now() - interval '6 hours'
      AND d.race_date <= now() + interval '7 days'
  )
);
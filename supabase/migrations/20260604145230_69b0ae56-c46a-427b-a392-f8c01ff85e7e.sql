
-- Restrict briefing_raised_hands SELECT to division participants and admins
DROP POLICY IF EXISTS "Any authenticated can view raised hands" ON public.briefing_raised_hands;

CREATE POLICY "Division participants and admins view raised hands"
  ON public.briefing_raised_hands
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.division_id = briefing_raised_hands.division_id
        AND e.user_id = auth.uid()
    )
  );

-- Add team_id to immutable-field comparison on entries UPDATE
DROP POLICY IF EXISTS "Users update own entries" ON public.entries;

CREATE POLICY "Users update own entries"
  ON public.entries
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.entries e2
        WHERE e2.id = entries.id
          AND e2.user_id = entries.user_id
          AND e2.waitlist = entries.waitlist
          AND e2.car_class IS NOT DISTINCT FROM entries.car_class
          AND e2.driver_category IS NOT DISTINCT FROM entries.driver_category
          AND e2.driver_name IS NOT DISTINCT FROM entries.driver_name
          AND e2.car_number IS NOT DISTINCT FROM entries.car_number
          AND e2.league_id IS NOT DISTINCT FROM entries.league_id
          AND e2.division_id IS NOT DISTINCT FROM entries.division_id
          AND e2.team_id IS NOT DISTINCT FROM entries.team_id
      )
    )
  );

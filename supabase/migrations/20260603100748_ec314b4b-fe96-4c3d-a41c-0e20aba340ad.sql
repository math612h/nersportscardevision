-- 1) division_lobbies: scope to the specific division only
DROP POLICY IF EXISTS "Approved enrolled drivers read division lobby" ON public.division_lobbies;

CREATE POLICY "Approved enrolled drivers read division lobby"
ON public.division_lobbies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM entries e
    JOIN profiles p ON p.id = e.user_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND e.division_id = division_lobbies.division_id
  )
);

-- 2) entries: pin identity/roster fields for non-admin self-updates
DROP POLICY IF EXISTS "Users update own entries" ON public.entries;

CREATE POLICY "Users update own entries"
ON public.entries
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM entries e2
      WHERE e2.id = entries.id
        AND e2.user_id      = entries.user_id
        AND e2.waitlist     = entries.waitlist
        AND e2.car_class    IS NOT DISTINCT FROM entries.car_class
        AND e2.driver_category IS NOT DISTINCT FROM entries.driver_category
        AND e2.driver_name  IS NOT DISTINCT FROM entries.driver_name
        AND e2.car_number   IS NOT DISTINCT FROM entries.car_number
        AND e2.league_id    IS NOT DISTINCT FROM entries.league_id
        AND e2.division_id  IS NOT DISTINCT FROM entries.division_id
    )
  )
);
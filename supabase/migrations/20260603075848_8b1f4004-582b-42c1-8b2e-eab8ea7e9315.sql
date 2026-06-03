
-- Fix 1: exclude waitlisted drivers from reading lobby credentials
DROP POLICY IF EXISTS "Approved enrolled drivers read division lobby" ON public.division_lobbies;

CREATE POLICY "Approved enrolled drivers read division lobby"
ON public.division_lobbies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND (
        e.division_id = division_lobbies.division_id
        OR e.league_id = (SELECT d.league_id FROM public.divisions d WHERE d.id = division_lobbies.division_id)
      )
  )
);

-- Fix 2: prevent users from changing their own waitlist flag
DROP POLICY IF EXISTS "Users update own entries" ON public.entries;

CREATE POLICY "Users update own entries"
ON public.entries
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  (
    private.has_role(auth.uid(), 'admin'::app_role)
  )
  OR (
    auth.uid() = user_id
    AND waitlist = (SELECT e2.waitlist FROM public.entries e2 WHERE e2.id = entries.id)
  )
);

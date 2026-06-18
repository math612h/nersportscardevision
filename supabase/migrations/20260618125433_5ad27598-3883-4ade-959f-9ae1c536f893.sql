DROP POLICY IF EXISTS "Approved users read practice sessions" ON public.division_practice_sessions;

CREATE POLICY "Approved enrolled drivers read practice sessions"
ON public.division_practice_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND e.division_id = division_practice_sessions.division_id
  )
);
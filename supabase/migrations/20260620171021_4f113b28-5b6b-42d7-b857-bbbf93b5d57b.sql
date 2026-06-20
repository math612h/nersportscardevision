
-- Safety-net: deny anon access entirely on both tables
CREATE POLICY "division_lobbies_deny_anon"
ON public.division_lobbies AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

CREATE POLICY "division_practice_sessions_deny_anon"
ON public.division_practice_sessions AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

-- Tighten practice sessions: scope reads to a sane time window around starts_at.
DROP POLICY IF EXISTS "Approved enrolled drivers read practice sessions" ON public.division_practice_sessions;

CREATE POLICY "Approved enrolled drivers read practice sessions"
ON public.division_practice_sessions FOR SELECT TO authenticated
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
  AND (
    division_practice_sessions.starts_at IS NULL
    OR (
      division_practice_sessions.starts_at <= (now() + interval '14 days')
      AND division_practice_sessions.starts_at >= (now() - interval '6 hours')
    )
  )
);

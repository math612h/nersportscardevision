DROP POLICY IF EXISTS "votes are public readable" ON public.overtaking_votes;
CREATE POLICY "authenticated can read votes"
  ON public.overtaking_votes
  FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.overtaking_votes FROM anon;
-- Restrict overtaking_votes SELECT: users see only their own votes; admins see all
DROP POLICY IF EXISTS "authenticated can read votes" ON public.overtaking_votes;
DROP POLICY IF EXISTS "anyone can read votes" ON public.overtaking_votes;

CREATE POLICY "users read own votes"
ON public.overtaking_votes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Aggregate vote counts without exposing voter identity
CREATE OR REPLACE FUNCTION public.overtaking_vote_counts(_clip_ids uuid[])
RETURNS TABLE(clip_id uuid, votes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.clip_id, count(*)::bigint AS votes
  FROM public.overtaking_votes v
  WHERE v.clip_id = ANY(_clip_ids)
  GROUP BY v.clip_id
$$;

GRANT EXECUTE ON FUNCTION public.overtaking_vote_counts(uuid[]) TO anon, authenticated, service_role;
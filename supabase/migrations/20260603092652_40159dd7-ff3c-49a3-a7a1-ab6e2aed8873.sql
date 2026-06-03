
-- 1. Leaderboard: require approved profile to insert
DROP POLICY IF EXISTS "Users insert leaderboard rows from own uploads" ON public.leaderboard_times;

CREATE POLICY "Approved users insert leaderboard rows"
ON public.leaderboard_times
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.approved = true
  )
);

-- 2. Profiles: stop self-approval. Keep separate admin policy untouched.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND approved = (SELECT p.approved FROM public.profiles p WHERE p.id = auth.uid())
);

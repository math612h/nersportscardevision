DROP POLICY IF EXISTS "Users insert own leaderboard rows" ON public.leaderboard_times;

CREATE POLICY "Users insert leaderboard rows from own uploads"
ON public.leaderboard_times
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());
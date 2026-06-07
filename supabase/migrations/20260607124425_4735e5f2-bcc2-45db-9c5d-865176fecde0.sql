DROP POLICY IF EXISTS "Own rating readable" ON public.user_league_ratings;
CREATE POLICY "Ratings readable to authenticated"
ON public.user_league_ratings
FOR SELECT
TO authenticated
USING (true);
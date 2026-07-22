DROP POLICY IF EXISTS coaching_ratings_select_authenticated ON public.coaching_ratings;

CREATE POLICY coaching_ratings_select_own_or_coach
ON public.coaching_ratings
FOR SELECT
TO authenticated
USING (
  auth.uid() = rater_user_id
  OR auth.uid() = coach_user_id
);

DROP POLICY IF EXISTS coaching_ratings_insert_own ON public.coaching_ratings;

CREATE POLICY coaching_ratings_insert_own
ON public.coaching_ratings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = rater_user_id
  AND EXISTS (
    SELECT 1 FROM public.coaching_bookings b
    WHERE b.id = coaching_ratings.booking_id
      AND b.user_id = auth.uid()
      AND b.coach_user_id = coaching_ratings.coach_user_id
  )
);
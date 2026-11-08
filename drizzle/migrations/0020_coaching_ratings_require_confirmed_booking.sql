DROP POLICY IF EXISTS coaching_ratings_insert_own ON public.coaching_ratings;
CREATE POLICY coaching_ratings_insert_own ON public.coaching_ratings
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = rater_user_id
  AND EXISTS (
    SELECT 1 FROM public.coaching_bookings b
    WHERE b.id = coaching_ratings.booking_id
      AND b.user_id = auth.uid()
      AND b.coach_user_id = coaching_ratings.coach_user_id
      AND b.status IN ('confirmed'::coaching_booking_status, 'completed'::coaching_booking_status)
      AND b.starts_at + make_interval(mins => COALESCE(b.duration_minutes, 0)) <= now()
  )
);

DROP POLICY IF EXISTS coaching_ratings_update_own ON public.coaching_ratings;
CREATE POLICY coaching_ratings_update_own ON public.coaching_ratings
FOR UPDATE TO authenticated
USING (auth.uid() = rater_user_id)
WITH CHECK (
  auth.uid() = rater_user_id
  AND EXISTS (
    SELECT 1 FROM public.coaching_bookings b
    WHERE b.id = coaching_ratings.booking_id
      AND b.user_id = auth.uid()
      AND b.coach_user_id = coaching_ratings.coach_user_id
      AND b.status IN ('confirmed'::coaching_booking_status, 'completed'::coaching_booking_status)
  )
);
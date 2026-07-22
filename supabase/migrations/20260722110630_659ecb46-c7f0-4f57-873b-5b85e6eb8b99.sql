
-- Add tracking column for when rating request notification was sent
ALTER TABLE public.coaching_bookings
  ADD COLUMN IF NOT EXISTS rating_request_sent_at TIMESTAMPTZ;

-- Ratings table
CREATE TABLE IF NOT EXISTS public.coaching_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE REFERENCES public.coaching_bookings(id) ON DELETE CASCADE,
  coach_user_id UUID NOT NULL,
  rater_user_id UUID NOT NULL,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_ratings TO authenticated;
GRANT ALL ON public.coaching_ratings TO service_role;

ALTER TABLE public.coaching_ratings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read ratings (used to show avg + comments on coach profiles)
CREATE POLICY "coaching_ratings_select_authenticated"
  ON public.coaching_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- Rater (the customer on the booking) can insert their own rating
CREATE POLICY "coaching_ratings_insert_own"
  ON public.coaching_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = rater_user_id
    AND EXISTS (
      SELECT 1 FROM public.coaching_bookings b
       WHERE b.id = booking_id
         AND b.user_id = auth.uid()
         AND b.coach_user_id = coach_user_id
    )
  );

-- Rater can update their own rating
CREATE POLICY "coaching_ratings_update_own"
  ON public.coaching_ratings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = rater_user_id)
  WITH CHECK (auth.uid() = rater_user_id);

-- Admins full access
CREATE POLICY "coaching_ratings_admin_all"
  ON public.coaching_ratings
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER coaching_ratings_touch_updated_at
  BEFORE UPDATE ON public.coaching_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

CREATE INDEX IF NOT EXISTS coaching_ratings_coach_idx ON public.coaching_ratings(coach_user_id);
CREATE INDEX IF NOT EXISTS coaching_ratings_rater_idx ON public.coaching_ratings(rater_user_id);

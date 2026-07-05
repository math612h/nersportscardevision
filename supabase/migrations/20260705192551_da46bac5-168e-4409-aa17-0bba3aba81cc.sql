
-- Tighten SELECT policies flagged by security scan.

-- coach_profiles: only owner/admin can see their own row; other authenticated users
-- can see rows that are marked active (needed for booking flow).
DROP POLICY IF EXISTS "coach_profiles read all auth" ON public.coach_profiles;
CREATE POLICY "coach_profiles read active or own"
  ON public.coach_profiles
  FOR SELECT
  TO authenticated
  USING (
    active = true
    OR auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- coach_availability: readable to owner/admin, and to authenticated users only
-- when the corresponding coach profile is active.
DROP POLICY IF EXISTS "coach_availability read all auth" ON public.coach_availability;
CREATE POLICY "coach_availability read active or own"
  ON public.coach_availability
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = coach_user_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.coach_profiles cp
      WHERE cp.user_id = coach_availability.coach_user_id
        AND cp.active = true
    )
  );

-- user_ratings: remove public/anon read; restrict to authenticated users.
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.user_ratings;
REVOKE SELECT ON public.user_ratings FROM anon;
CREATE POLICY "Ratings readable to authenticated"
  ON public.user_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- user_class_ratings: remove public/anon read; restrict to authenticated users.
DROP POLICY IF EXISTS "Class ratings are public" ON public.user_class_ratings;
REVOKE SELECT ON public.user_class_ratings FROM anon;
CREATE POLICY "Class ratings readable to authenticated"
  ON public.user_class_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- user_league_ratings: scope to owner + admin only.
DROP POLICY IF EXISTS "Ratings readable to authenticated" ON public.user_league_ratings;
CREATE POLICY "League ratings owner or admin"
  ON public.user_league_ratings
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

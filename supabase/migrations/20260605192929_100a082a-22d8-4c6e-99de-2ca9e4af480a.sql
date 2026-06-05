
-- 1) Restrict sensitive profile columns: revoke direct SELECT on age + discord_username
REVOKE SELECT (age, discord_username) ON public.profiles FROM authenticated;
REVOKE SELECT (age, discord_username) ON public.profiles FROM anon;
-- Keep service_role full access (implicit). Re-grant SELECT on safe columns explicitly so
-- table-level SELECT continues to work for everything else.
GRANT SELECT (id, display_name, lmu_name, bio, achievements, avatar_url, approved, created_at, updated_at)
  ON public.profiles TO authenticated;
GRANT SELECT (id, display_name, lmu_name, avatar_url, approved)
  ON public.profiles TO anon;
-- UPDATE on sensitive columns is still needed for the owner editing their profile.
GRANT UPDATE (age, discord_username) ON public.profiles TO authenticated;

-- 2) Tighten briefing_raised_hands SELECT to active (non-waitlisted) entries
DROP POLICY IF EXISTS "Division participants and admins view raised hands" ON public.briefing_raised_hands;
CREATE POLICY "Division participants and admins view raised hands"
  ON public.briefing_raised_hands
  FOR SELECT
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.division_id = briefing_raised_hands.division_id
        AND e.user_id = auth.uid()
        AND e.waitlist = false
    )
  );

-- 3) Prevent team_members INSERT for another user; require self-insert (admins still bypass)
DROP POLICY IF EXISTS "Admin or accepted-invitation insert members" ON public.team_members;
CREATE POLICY "Admin or self-accepted-invitation insert members"
  ON public.team_members
  FOR INSERT
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (
      team_members.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.team_invitations ti
        WHERE ti.team_id = team_members.team_id
          AND ti.user_id = auth.uid()
          AND ti.status = 'accepted'::team_request_status
      )
    )
  );

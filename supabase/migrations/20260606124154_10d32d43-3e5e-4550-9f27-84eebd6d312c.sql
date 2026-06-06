
-- =====================================================================
-- 1. leaderboard_times: stop leaking user UUIDs to anon
-- =====================================================================
DROP POLICY IF EXISTS "Leaderboard readable by everyone (anon)" ON public.leaderboard_times;
REVOKE SELECT ON public.leaderboard_times FROM anon;

CREATE OR REPLACE VIEW public.leaderboard_times_public AS
SELECT id, driver_name, car_model, recorded_at, track, layout, car_class,
       best_lap_ms, division_id, source, created_at
FROM public.leaderboard_times;

ALTER VIEW public.leaderboard_times_public SET (security_invoker = off);
GRANT SELECT ON public.leaderboard_times_public TO anon, authenticated;

-- =====================================================================
-- 2. team_members: stop leaking user UUIDs to anon
-- =====================================================================
DROP POLICY IF EXISTS "Team members readable by anon" ON public.team_members;
REVOKE SELECT ON public.team_members FROM anon;

CREATE OR REPLACE VIEW public.team_members_public AS
SELECT id, team_id, role, created_at
FROM public.team_members;

ALTER VIEW public.team_members_public SET (security_invoker = off);
GRANT SELECT ON public.team_members_public TO anon, authenticated;

-- =====================================================================
-- 3. team_invitations: pin immutable fields via trigger; tighten policy
-- =====================================================================
DROP POLICY IF EXISTS "Invitee respond to invitation" ON public.team_invitations;

CREATE OR REPLACE FUNCTION public.team_invitations_pin_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on invitee-driven updates (when caller is the invitee
  -- and not the team owner / admin). For owner/admin paths we leave the
  -- separate "Owner or admin update invitation" policy in charge.
  IF auth.uid() = OLD.user_id
     AND NOT private.is_team_owner(OLD.team_id, auth.uid())
     AND NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.team_id    IS DISTINCT FROM OLD.team_id
    OR NEW.user_id    IS DISTINCT FROM OLD.user_id
    OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Invitee cannot modify immutable fields on a team invitation';
    END IF;
    IF NEW.status NOT IN ('accepted'::team_request_status, 'rejected'::team_request_status) THEN
      RAISE EXCEPTION 'Invitee can only set status to accepted or rejected';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_invitations_pin_immutable ON public.team_invitations;
CREATE TRIGGER team_invitations_pin_immutable
BEFORE UPDATE ON public.team_invitations
FOR EACH ROW EXECUTE FUNCTION public.team_invitations_pin_immutable();

CREATE POLICY "Invitee respond to invitation"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

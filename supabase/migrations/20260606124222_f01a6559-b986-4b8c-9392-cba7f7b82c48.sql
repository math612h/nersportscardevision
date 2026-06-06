
-- Drop the security-definer views; switch to column-level grants on the base tables.
DROP VIEW IF EXISTS public.leaderboard_times_public;
DROP VIEW IF EXISTS public.team_members_public;

-- ---------- leaderboard_times ----------
CREATE POLICY "Leaderboard readable by everyone (anon)"
ON public.leaderboard_times
FOR SELECT
TO anon
USING (true);

-- Anon may only read non-identifying columns
GRANT SELECT (id, driver_name, car_model, recorded_at, track, layout,
              car_class, best_lap_ms, division_id, source, created_at)
ON public.leaderboard_times TO anon;

-- ---------- team_members ----------
CREATE POLICY "Team members readable by anon"
ON public.team_members
FOR SELECT
TO anon
USING (true);

GRANT SELECT (id, team_id, role, created_at)
ON public.team_members TO anon;

-- ---------- team_invitations trigger: SECURITY INVOKER ----------
CREATE OR REPLACE FUNCTION public.team_invitations_pin_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
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

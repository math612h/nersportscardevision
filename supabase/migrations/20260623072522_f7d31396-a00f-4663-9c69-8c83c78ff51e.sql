
-- 1) car_class on team membership tables
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS car_class TEXT;
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS car_class TEXT;
ALTER TABLE public.team_applications ADD COLUMN IF NOT EXISTS car_class TEXT;

-- 2) Owner / admin can update team_members (needed to change a member's class)
DROP POLICY IF EXISTS "Owner or admin updates member" ON public.team_members;
CREATE POLICY "Owner or admin updates member"
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

-- 3) Allow invitee to update car_class to NULL only if needed? No — owner sets it. The pin-immutable trigger
--    already restricts invitee updates. car_class is not in the immutable set so owner can still change it.
--    But the invitee's UPDATE policy lets them update; pin-immutable trigger forbids changing fields other than status.
--    Add car_class to the immutable list for invitee updates.
CREATE OR REPLACE FUNCTION public.team_invitations_pin_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() = OLD.user_id
     AND NOT private.is_team_owner(OLD.team_id, auth.uid())
     AND NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.team_id    IS DISTINCT FROM OLD.team_id
    OR NEW.user_id    IS DISTINCT FROM OLD.user_id
    OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.car_class  IS DISTINCT FROM OLD.car_class THEN
      RAISE EXCEPTION 'Invitee cannot modify immutable fields on a team invitation';
    END IF;
    IF NEW.status NOT IN ('accepted'::team_request_status, 'rejected'::team_request_status) THEN
      RAISE EXCEPTION 'Invitee can only set status to accepted or rejected';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) When invitation is accepted -> set team_members.car_class from the invitation.
--    Members are inserted by client code after acceptance; backfill via AFTER INSERT trigger on team_members.
CREATE OR REPLACE FUNCTION public.set_team_member_car_class_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cc text;
BEGIN
  IF NEW.car_class IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Prefer most recent accepted invitation
  SELECT car_class INTO _cc
    FROM public.team_invitations
   WHERE team_id = NEW.team_id AND user_id = NEW.user_id
     AND car_class IS NOT NULL
   ORDER BY responded_at DESC NULLS LAST, created_at DESC
   LIMIT 1;
  IF _cc IS NULL THEN
    SELECT car_class INTO _cc
      FROM public.team_applications
     WHERE team_id = NEW.team_id AND user_id = NEW.user_id
       AND car_class IS NOT NULL
     ORDER BY responded_at DESC NULLS LAST, created_at DESC
     LIMIT 1;
  END IF;
  IF _cc IS NOT NULL THEN
    NEW.car_class := _cc;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_members_set_car_class ON public.team_members;
CREATE TRIGGER team_members_set_car_class
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_team_member_car_class_on_join();

-- 5) Refresh team-score function: use league_team_lineup (accepted) instead of entries,
--    and require >=2 accepted lineup members participated in a round to count it.
CREATE OR REPLACE FUNCTION public.compute_team_score(_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lb_score NUMERIC := 50;
  res_score NUMERIC := 50;
  combined NUMERIC;
  lb_frac NUMERIC;
  team_avg_pos NUMERIC;
  platform_avg_pos NUMERIC;
  has_lb BOOLEAN := false;
  has_res BOOLEAN := false;
BEGIN
  -- Leaderboard component (uses team members' best laps; not class-bound)
  WITH team_bests AS (
    SELECT lt.track, lt.layout, lt.car_class, MIN(lt.best_lap_ms) AS bm
      FROM public.leaderboard_times lt
      JOIN public.team_members tm ON tm.user_id = lt.user_id
     WHERE tm.team_id = _team_id
     GROUP BY lt.track, lt.layout, lt.car_class
  ),
  all_team_bests AS (
    SELECT lt.track, lt.layout, lt.car_class, tm.team_id, MIN(lt.best_lap_ms) AS bm
      FROM public.leaderboard_times lt
      JOIN public.team_members tm ON tm.user_id = lt.user_id
     GROUP BY lt.track, lt.layout, lt.car_class, tm.team_id
  ),
  medians AS (
    SELECT track, layout, car_class,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY bm) AS med
      FROM all_team_bests
     GROUP BY track, layout, car_class
  )
  SELECT AVG((m.med - tb.bm) / NULLIF(m.med, 0))
    INTO lb_frac
    FROM team_bests tb
    JOIN medians m USING (track, layout, car_class);

  IF lb_frac IS NOT NULL THEN
    has_lb := true;
    lb_score := 50 + 50 * lb_frac;
  END IF;

  -- Results component: only count (league, round, class) where this team has >=2 accepted lineup members participating
  WITH team_rounds AS (
    SELECT lte.league_id, lr.round, lte.car_class, AVG(lr.position) AS pos, COUNT(*) AS n
      FROM public.league_team_entries lte
      JOIN public.league_team_lineup ltl
        ON ltl.league_team_entry_id = lte.id AND ltl.status = 'accepted'
      JOIN public.league_results lr
        ON lr.league_id = lte.league_id
       AND lr.car_class = lte.car_class
       AND lr.user_id = ltl.user_id
       AND lr.position IS NOT NULL
     WHERE lte.team_id = _team_id
       AND lte.status <> 'withdrawn'
     GROUP BY lte.league_id, lr.round, lte.car_class
    HAVING COUNT(*) >= 2
  )
  SELECT AVG(pos) INTO team_avg_pos FROM team_rounds;

  IF team_avg_pos IS NOT NULL THEN
    has_res := true;
    WITH all_team_rounds AS (
      SELECT lte.league_id, lr.round, lte.car_class, lte.team_id, AVG(lr.position) AS pos
        FROM public.league_team_entries lte
        JOIN public.league_team_lineup ltl
          ON ltl.league_team_entry_id = lte.id AND ltl.status = 'accepted'
        JOIN public.league_results lr
          ON lr.league_id = lte.league_id
         AND lr.car_class = lte.car_class
         AND lr.user_id = ltl.user_id
         AND lr.position IS NOT NULL
       WHERE lte.status <> 'withdrawn'
       GROUP BY lte.league_id, lr.round, lte.car_class, lte.team_id
      HAVING COUNT(*) >= 2
    )
    SELECT AVG(pos) INTO platform_avg_pos FROM all_team_rounds;

    IF platform_avg_pos IS NOT NULL AND platform_avg_pos > 0 THEN
      res_score := 50 + 50 * (platform_avg_pos - team_avg_pos) / platform_avg_pos;
    END IF;
  END IF;

  combined := 0.2 * lb_score + 0.8 * res_score;

  RETURN jsonb_build_object(
    'score', round(combined::numeric, 2),
    'leaderboard_score', round(lb_score::numeric, 2),
    'results_score', round(res_score::numeric, 2),
    'has_leaderboard_data', has_lb,
    'has_results_data', has_res
  );
END;
$function$;

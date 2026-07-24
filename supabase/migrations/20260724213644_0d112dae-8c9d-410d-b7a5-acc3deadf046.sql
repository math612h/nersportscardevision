
-- 1) Analytics events: validate payload size/content on insert
CREATE OR REPLACE FUNCTION public.validate_analytics_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.session_id IS NULL OR length(NEW.session_id) > 100 THEN
    RAISE EXCEPTION 'Invalid session_id';
  END IF;
  IF NEW.event_type IS NULL OR length(NEW.event_type) > 50 THEN
    RAISE EXCEPTION 'Invalid event_type';
  END IF;
  IF NEW.path IS NOT NULL AND length(NEW.path) > 500 THEN
    NEW.path := left(NEW.path, 500);
  END IF;
  IF NEW.referrer IS NOT NULL AND length(NEW.referrer) > 500 THEN
    NEW.referrer := left(NEW.referrer, 500);
  END IF;
  IF NEW.user_agent IS NOT NULL AND length(NEW.user_agent) > 500 THEN
    NEW.user_agent := left(NEW.user_agent, 500);
  END IF;
  IF NEW.duration_ms IS NOT NULL AND (NEW.duration_ms < 0 OR NEW.duration_ms > 86400000) THEN
    NEW.duration_ms := NULL;
  END IF;
  -- strip NULs which can break log processing
  IF NEW.path IS NOT NULL THEN NEW.path := replace(NEW.path, chr(0), ''); END IF;
  IF NEW.referrer IS NOT NULL THEN NEW.referrer := replace(NEW.referrer, chr(0), ''); END IF;
  IF NEW.user_agent IS NOT NULL THEN NEW.user_agent := replace(NEW.user_agent, chr(0), ''); END IF;
  NEW.event_type := replace(NEW.event_type, chr(0), '');
  NEW.session_id := replace(NEW.session_id, chr(0), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_analytics_event_trg ON public.analytics_events;
CREATE TRIGGER validate_analytics_event_trg
BEFORE INSERT ON public.analytics_events
FOR EACH ROW EXECUTE FUNCTION public.validate_analytics_event();


-- 2) Coach profiles: forbid self-edits to `achievements` column
CREATE OR REPLACE FUNCTION public.prevent_coach_profile_achievements_self_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / internal (no auth context) may update freely
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Admins may update freely
  IF private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.achievements IS DISTINCT FROM OLD.achievements THEN
    NEW.achievements := OLD.achievements;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_coach_achievements_self_edit_trg ON public.coach_profiles;
CREATE TRIGGER prevent_coach_achievements_self_edit_trg
BEFORE UPDATE ON public.coach_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_coach_profile_achievements_self_edit();

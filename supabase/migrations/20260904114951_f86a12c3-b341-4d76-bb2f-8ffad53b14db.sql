CREATE OR REPLACE FUNCTION public.get_division_practice_credentials(_division_id uuid)
RETURNS TABLE (
  id uuid,
  lobby_code text,
  lobby_password text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _league uuid;
  _privileged boolean;
  _member boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT d.league_id INTO _league FROM public.divisions d WHERE d.id = _division_id;
  IF _league IS NULL THEN
    RETURN;
  END IF;

  _privileged := private.has_role(_uid, 'admin'::app_role) OR public.is_steward(_uid);

  IF NOT _privileged THEN
    SELECT EXISTS (
      SELECT 1 FROM public.entries e
      JOIN public.profiles p ON p.id = e.user_id
      WHERE e.user_id = _uid AND p.approved = true AND e.waitlist = false AND e.league_id = _league
    ) OR EXISTS (
      SELECT 1 FROM public.league_team_lineup l
      JOIN public.league_team_entries te ON te.id = l.league_team_entry_id
      JOIN public.profiles p ON p.id = l.user_id
      WHERE l.user_id = _uid AND p.approved = true
        AND te.status = 'confirmed'::league_team_entry_status
        AND te.league_id = _league
    ) INTO _member;

    IF NOT _member THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT ps.id, ps.lobby_code, ps.lobby_password
    FROM public.division_practice_sessions ps
    WHERE ps.division_id = _division_id
      AND ps.starts_at IS NOT NULL
      AND now() >= ps.starts_at - interval '3 hours'
      AND now() <= ps.starts_at + interval '6 hours';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ps.id, ps.lobby_code, ps.lobby_password
  FROM public.division_practice_sessions ps
  WHERE ps.division_id = _division_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_division_practice_credentials(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_division_practice_credentials(uuid) FROM anon, public;
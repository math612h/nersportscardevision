-- Hide lobby credential columns from ordinary authenticated reads
REVOKE SELECT (lobby_code, lobby_password, am_lobby_code, am_lobby_password)
  ON public.division_lobbies FROM authenticated;
REVOKE SELECT (lobby_code, lobby_password)
  ON public.division_practice_sessions FROM authenticated;

-- Time-gated accessor for race lobby credentials
CREATE OR REPLACE FUNCTION public.get_division_lobby(_division_id uuid)
RETURNS TABLE (
  server_name text,
  lobby_code text,
  lobby_password text,
  am_server_name text,
  am_lobby_code text,
  am_lobby_password text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _league uuid;
  _race timestamptz;
  _opens timestamptz;
  _closes timestamptz;
  _privileged boolean;
  _member boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT d.league_id, d.race_date INTO _league, _race
  FROM public.divisions d WHERE d.id = _division_id;
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

    -- Opens 3 hours before the earliest scheduled session, closes 12 hours after the race
    SELECT LEAST(
             COALESCE(_race, now()),
             COALESCE((SELECT MIN(ps.starts_at) FROM public.division_practice_sessions ps
                       WHERE ps.division_id = _division_id), COALESCE(_race, now()))
           ) - interval '3 hours'
      INTO _opens;
    _closes := COALESCE(_race, now()) + interval '12 hours';

    IF now() < _opens OR now() > _closes THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT dl.server_name, dl.lobby_code, dl.lobby_password,
         dl.am_server_name, dl.am_lobby_code, dl.am_lobby_password
  FROM public.division_lobbies dl
  WHERE dl.division_id = _division_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_division_lobby(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_division_lobby(uuid) FROM anon, public;

-- Time-gated accessor for practice session credentials
CREATE OR REPLACE FUNCTION public.get_practice_session_credentials(_session_id uuid)
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
  _division uuid;
  _starts timestamptz;
  _privileged boolean;
  _member boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT ps.division_id, ps.starts_at, d.league_id
    INTO _division, _starts, _league
  FROM public.division_practice_sessions ps
  JOIN public.divisions d ON d.id = ps.division_id
  WHERE ps.id = _session_id;
  IF _division IS NULL THEN
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

    IF _starts IS NULL
       OR now() < _starts - interval '3 hours'
       OR now() > _starts + interval '6 hours' THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT ps.id, ps.lobby_code, ps.lobby_password
  FROM public.division_practice_sessions ps
  WHERE ps.id = _session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_practice_session_credentials(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_practice_session_credentials(uuid) FROM anon, public;
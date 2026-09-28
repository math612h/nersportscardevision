CREATE POLICY "Anyone can read practice sessions" ON public.division_practice_sessions FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.division_practice_sessions TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_division_practice_credentials(_division_id uuid)
 RETURNS TABLE(id uuid, lobby_code text, lobby_password text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _privileged boolean := false;
BEGIN
  IF _uid IS NOT NULL THEN
    _privileged := private.has_role(_uid, 'admin'::app_role) OR public.is_steward(_uid);
  END IF;
  IF _privileged THEN
    RETURN QUERY SELECT ps.id, ps.lobby_code, ps.lobby_password
      FROM public.division_practice_sessions ps WHERE ps.division_id = _division_id;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT ps.id, ps.lobby_code, ps.lobby_password
  FROM public.division_practice_sessions ps
  WHERE ps.division_id = _division_id
    AND ps.starts_at IS NOT NULL
    AND now() >= ps.starts_at - interval '3 hours'
    AND now() <= ps.starts_at + interval '6 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_practice_session_credentials(_session_id uuid)
 RETURNS TABLE(id uuid, lobby_code text, lobby_password text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _privileged boolean := false;
BEGIN
  IF _uid IS NOT NULL THEN
    _privileged := private.has_role(_uid, 'admin'::app_role) OR public.is_steward(_uid);
  END IF;
  RETURN QUERY
  SELECT ps.id, ps.lobby_code, ps.lobby_password
  FROM public.division_practice_sessions ps
  WHERE ps.id = _session_id
    AND (_privileged OR (ps.starts_at IS NOT NULL
      AND now() >= ps.starts_at - interval '3 hours'
      AND now() <= ps.starts_at + interval '6 hours'));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_division_practice_credentials(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_session_credentials(uuid) TO anon, authenticated;
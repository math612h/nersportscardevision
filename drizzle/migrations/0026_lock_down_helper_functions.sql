REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.is_steward(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (_user_id = auth.uid() OR auth.uid() IS NULL)
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'steward')
$$;
CREATE OR REPLACE FUNCTION public.is_chat_group_member(_group_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (_user_id = auth.uid() OR auth.uid() IS NULL)
    AND EXISTS (SELECT 1 FROM public.chat_group_members WHERE group_id = _group_id AND user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.is_steward(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_chat_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_steward(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_chat_group_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_division_practice_credentials(_division_id uuid)
 RETURNS TABLE(id uuid, lobby_code text, lobby_password text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _league uuid;
  _member boolean;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF private.has_role(_uid, 'admin'::app_role) OR public.is_steward(_uid) THEN
    RETURN QUERY SELECT ps.id, ps.lobby_code, ps.lobby_password
      FROM public.division_practice_sessions ps WHERE ps.division_id = _division_id;
    RETURN;
  END IF;
  SELECT d.league_id INTO _league FROM public.divisions d WHERE d.id = _division_id;
  IF _league IS NULL THEN RETURN; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.entries e JOIN public.profiles p ON p.id = e.user_id
    WHERE e.user_id = _uid AND p.approved = true AND e.waitlist = false
      AND e.withdrawn_at IS NULL AND e.league_id = _league
  ) OR EXISTS (
    SELECT 1 FROM public.league_team_lineup l
    JOIN public.league_team_entries te ON te.id = l.league_team_entry_id
    JOIN public.profiles p ON p.id = l.user_id
    WHERE l.user_id = _uid AND p.approved = true
      AND te.status = 'confirmed'::league_team_entry_status AND te.league_id = _league
  ) INTO _member;
  IF NOT _member THEN RETURN; END IF;
  RETURN QUERY
  SELECT ps.id, ps.lobby_code, ps.lobby_password
  FROM public.division_practice_sessions ps
  WHERE ps.division_id = _division_id
    AND ps.starts_at IS NOT NULL
    AND now() >= ps.starts_at - interval '3 hours'
    AND now() <= ps.starts_at + interval '6 hours';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_division_practice_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_division_practice_credentials(uuid) TO authenticated, service_role;
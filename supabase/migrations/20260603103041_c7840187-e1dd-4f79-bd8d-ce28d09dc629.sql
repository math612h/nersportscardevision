-- Revoke direct column access to sensitive fields
REVOKE SELECT (age, discord_username) ON public.profiles FROM anon, authenticated;

-- Secure accessor returning sensitive fields only for the owner or admins
CREATE OR REPLACE FUNCTION public.get_profile_private(_user_id uuid)
RETURNS TABLE (age integer, discord_username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.age, p.discord_username
  FROM public.profiles p
  WHERE p.id = _user_id
    AND (auth.uid() = _user_id OR private.has_role(auth.uid(), 'admin'::app_role));
$$;

REVOKE ALL ON FUNCTION public.get_profile_private(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_private(uuid) TO authenticated;
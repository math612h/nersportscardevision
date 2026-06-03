-- Revoke direct SELECT on private profile columns; reads must go through get_profile_private()
REVOKE SELECT (age, discord_username) ON public.profiles FROM anon, authenticated;

-- Lock down SECURITY DEFINER RPC: only authenticated users may execute,
-- and the function already verifies caller is owner or admin.
REVOKE EXECUTE ON FUNCTION public.get_profile_private(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_private(uuid) TO authenticated;

-- handle_new_user is a trigger function on auth.users; it should not be callable via API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
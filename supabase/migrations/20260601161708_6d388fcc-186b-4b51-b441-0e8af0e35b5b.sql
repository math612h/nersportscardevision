GRANT SELECT ON public.leagues TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;

GRANT SELECT ON public.divisions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.divisions TO authenticated;
GRANT ALL ON public.divisions TO service_role;

GRANT SELECT ON public.rulesets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rulesets TO authenticated;
GRANT ALL ON public.rulesets TO service_role;

GRANT SELECT ON public.entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protests TO authenticated;
GRANT ALL ON public.protests TO service_role;

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
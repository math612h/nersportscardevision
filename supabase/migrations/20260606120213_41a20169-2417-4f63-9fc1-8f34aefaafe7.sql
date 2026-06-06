CREATE OR REPLACE FUNCTION public.get_profile_private(_user_id uuid)
RETURNS TABLE(age integer, discord_username text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT pp.age, pp.discord_username
  FROM public.profiles_private pp
  WHERE pp.user_id = _user_id;
$function$;
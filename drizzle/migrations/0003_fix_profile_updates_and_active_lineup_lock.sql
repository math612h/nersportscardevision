ALTER POLICY "Users can update own profile"
ON public.profiles
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND approved = (
    SELECT p.approved
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.user_locked_team(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT lte.team_id
    FROM public.league_team_lineup l
    JOIN public.league_team_entries lte ON lte.id = l.league_team_entry_id
   WHERE l.user_id = _user_id
     AND l.status = 'accepted'
     AND l.effective_until IS NULL
     AND lte.status = 'confirmed'
     AND public.league_is_active(lte.league_id)
   LIMIT 1;
$function$;
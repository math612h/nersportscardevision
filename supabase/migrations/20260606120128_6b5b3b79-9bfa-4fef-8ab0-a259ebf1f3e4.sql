-- 1) Create private table
CREATE TABLE public.profiles_private (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age integer,
  discord_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_private TO authenticated;
GRANT ALL ON public.profiles_private TO service_role;

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own private profile"
  ON public.profiles_private FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all private profiles"
  ON public.profiles_private FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner can insert own private profile"
  ON public.profiles_private FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can update own private profile"
  ON public.profiles_private FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can delete own private profile"
  ON public.profiles_private FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger reuses existing helper
CREATE TRIGGER touch_profiles_private_updated_at
  BEFORE UPDATE ON public.profiles_private
  FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_updated_at();

-- 2) Backfill from profiles
INSERT INTO public.profiles_private (user_id, age, discord_username)
SELECT id, age, discord_username
FROM public.profiles
WHERE age IS NOT NULL OR discord_username IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3) Drop sensitive columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS age;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS discord_username;

-- 4) Update helper to read from new private table
CREATE OR REPLACE FUNCTION public.get_profile_private(_user_id uuid)
RETURNS TABLE(age integer, discord_username text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT pp.age, pp.discord_username
  FROM public.profiles_private pp
  WHERE pp.user_id = _user_id
    AND (auth.uid() = _user_id OR private.has_role(auth.uid(), 'admin'::app_role));
$function$;
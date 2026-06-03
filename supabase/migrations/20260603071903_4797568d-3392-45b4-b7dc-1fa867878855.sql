
-- 1. Create division_lobbies table for sensitive lobby credentials
CREATE TABLE public.division_lobbies (
  division_id UUID PRIMARY KEY,
  lobby_code TEXT,
  lobby_password TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.division_lobbies TO authenticated;
GRANT ALL ON public.division_lobbies TO service_role;

ALTER TABLE public.division_lobbies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage division lobbies"
  ON public.division_lobbies
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved enrolled drivers read division lobby"
  ON public.division_lobbies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.profiles p ON p.id = e.user_id
      WHERE e.user_id = auth.uid()
        AND p.approved = true
        AND (
          e.division_id = division_lobbies.division_id
          OR e.league_id = (SELECT d.league_id FROM public.divisions d WHERE d.id = division_lobbies.division_id)
        )
    )
  );

-- 2. Migrate existing lobby data out of divisions.settings
INSERT INTO public.division_lobbies (division_id, lobby_code, lobby_password)
SELECT id,
       NULLIF(settings->>'lobby_code', ''),
       NULLIF(settings->>'lobby_password', '')
FROM public.divisions
WHERE (settings ? 'lobby_code' AND NULLIF(settings->>'lobby_code','') IS NOT NULL)
   OR (settings ? 'lobby_password' AND NULLIF(settings->>'lobby_password','') IS NOT NULL);

-- 3. Strip sensitive fields from divisions.settings (still publicly readable for weather/results)
UPDATE public.divisions
SET settings = settings - 'lobby_code' - 'lobby_password'
WHERE settings ? 'lobby_code' OR settings ? 'lobby_password';

-- 4. Restrict profiles: remove anonymous read access (sensitive: age, discord_username)
DROP POLICY IF EXISTS "Profiles readable by anon" ON public.profiles;

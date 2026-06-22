
CREATE TABLE public.guest_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked boolean NOT NULL DEFAULT false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_codes TO authenticated;
GRANT ALL ON public.guest_codes TO service_role;

ALTER TABLE public.guest_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage guest codes" ON public.guest_codes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Block guests from creating signups/entries
CREATE POLICY "Guests cannot insert entries" ON public.entries
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_role(auth.uid(), 'guest'::app_role));

CREATE POLICY "Guests cannot insert team entries" ON public.league_team_entries
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_role(auth.uid(), 'guest'::app_role));

CREATE POLICY "Guests cannot insert lineup" ON public.league_team_lineup
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_role(auth.uid(), 'guest'::app_role));

CREATE POLICY "Guests cannot create teams" ON public.teams
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_role(auth.uid(), 'guest'::app_role));

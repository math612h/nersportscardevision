
CREATE TABLE public.division_practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  server_name text,
  lobby_code text,
  lobby_password text,
  has_qualifying boolean NOT NULL DEFAULT false,
  has_race boolean NOT NULL DEFAULT false,
  practice_minutes integer,
  qualifying_minutes integer,
  race_minutes integer,
  starts_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX division_practice_sessions_division_id_idx
  ON public.division_practice_sessions(division_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.division_practice_sessions TO authenticated;
GRANT ALL ON public.division_practice_sessions TO service_role;

ALTER TABLE public.division_practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage practice sessions"
  ON public.division_practice_sessions
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved users read practice sessions"
  ON public.division_practice_sessions
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.approved = true
  ));

CREATE TRIGGER trg_division_practice_sessions_updated_at
  BEFORE UPDATE ON public.division_practice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_division_reserve_offers_updated_at();

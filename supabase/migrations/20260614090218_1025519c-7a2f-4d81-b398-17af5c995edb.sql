
CREATE TABLE public.league_rules_acknowledgements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);

GRANT SELECT, INSERT ON public.league_rules_acknowledgements TO authenticated;
GRANT ALL ON public.league_rules_acknowledgements TO service_role;

ALTER TABLE public.league_rules_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rules ack"
ON public.league_rules_acknowledgements
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own rules ack"
ON public.league_rules_acknowledgements
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all rules ack"
ON public.league_rules_acknowledgements
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.briefing_raised_hands (
  division_id UUID NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (division_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_raised_hands TO authenticated;
GRANT ALL ON public.briefing_raised_hands TO service_role;

ALTER TABLE public.briefing_raised_hands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any authenticated can view raised hands"
  ON public.briefing_raised_hands FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can raise their own hand"
  ON public.briefing_raised_hands FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can lower their own hand; admins can lower any"
  ON public.briefing_raised_hands FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.briefing_raised_hands;
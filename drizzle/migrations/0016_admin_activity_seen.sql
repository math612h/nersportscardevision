CREATE TABLE public.admin_activity_seen (
  user_id uuid NOT NULL,
  league_id uuid NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);
GRANT SELECT, INSERT, UPDATE ON public.admin_activity_seen TO authenticated;
GRANT ALL ON public.admin_activity_seen TO service_role;
ALTER TABLE public.admin_activity_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own seen markers read" ON public.admin_activity_seen FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own seen markers insert" ON public.admin_activity_seen FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own seen markers update" ON public.admin_activity_seen FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
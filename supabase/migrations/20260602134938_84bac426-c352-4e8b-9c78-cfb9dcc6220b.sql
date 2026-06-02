CREATE TABLE public.leaderboard_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  driver_name text NOT NULL,
  track text NOT NULL,
  layout text,
  car_class text NOT NULL,
  best_lap_ms integer NOT NULL CHECK (best_lap_ms > 0 AND best_lap_ms < 3600000),
  source text NOT NULL CHECK (source IN ('admin','user')),
  uploaded_by uuid NOT NULL,
  division_id uuid,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leaderboard_times_filter_idx ON public.leaderboard_times (track, layout, car_class, best_lap_ms);
CREATE INDEX leaderboard_times_user_idx ON public.leaderboard_times (user_id);
CREATE INDEX leaderboard_times_uploaded_by_idx ON public.leaderboard_times (uploaded_by);

GRANT SELECT ON public.leaderboard_times TO anon;
GRANT SELECT, INSERT, DELETE ON public.leaderboard_times TO authenticated;
GRANT ALL ON public.leaderboard_times TO service_role;

ALTER TABLE public.leaderboard_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaderboard readable by everyone (auth)"
  ON public.leaderboard_times FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leaderboard readable by everyone (anon)"
  ON public.leaderboard_times FOR SELECT TO anon USING (true);

-- Regular users may insert rows only as themselves, and only link to their own user_id (or null)
CREATE POLICY "Users insert own leaderboard rows"
  ON public.leaderboard_times FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (user_id IS NULL OR user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Users or admin delete leaderboard rows"
  ON public.leaderboard_times FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));
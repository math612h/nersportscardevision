
-- 1. entries: behold tilmelding når en division slettes, men flyt til venteliste
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_division_id_fkey;
ALTER TABLE public.entries
  ADD CONSTRAINT entries_division_id_fkey
  FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.move_entries_to_waitlist_on_division_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.entries
     SET waitlist = true
   WHERE division_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_divisions_move_entries_waitlist ON public.divisions;
CREATE TRIGGER trg_divisions_move_entries_waitlist
BEFORE DELETE ON public.divisions
FOR EACH ROW EXECUTE FUNCTION public.move_entries_to_waitlist_on_division_delete();

-- 2. leaderboard_times: tillad 'league' som source
ALTER TABLE public.leaderboard_times DROP CONSTRAINT IF EXISTS leaderboard_times_source_check;
ALTER TABLE public.leaderboard_times
  ADD CONSTRAINT leaderboard_times_source_check
  CHECK (source = ANY (ARRAY['admin'::text, 'user'::text, 'league'::text]));

-- 3. league_results
CREATE TABLE public.league_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id    uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  division_id  uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  round        integer,
  track        text NOT NULL,
  layout       text,
  car_class    text NOT NULL,
  car_model    text,
  best_lap_ms  integer,
  avg_lap_ms   integer,
  position     integer,
  points       numeric,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX league_results_user_league_idx ON public.league_results(user_id, league_id);
CREATE INDEX league_results_league_class_idx ON public.league_results(league_id, car_class);

GRANT SELECT ON public.league_results TO anon, authenticated;
GRANT ALL ON public.league_results TO service_role;

ALTER TABLE public.league_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "League results readable by everyone (anon)"
  ON public.league_results FOR SELECT TO anon USING (true);
CREATE POLICY "League results readable by everyone (auth)"
  ON public.league_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert league results"
  ON public.league_results FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update league results"
  ON public.league_results FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete league results"
  ON public.league_results FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_league_results_updated_at
BEFORE UPDATE ON public.league_results
FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_updated_at();

-- 4. user_league_ratings
CREATE TABLE public.user_league_ratings (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id   uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  car_class   text NOT NULL,
  score       numeric NOT NULL DEFAULT 50,
  confidence  numeric NOT NULL DEFAULT 0,
  components  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id, car_class)
);

CREATE INDEX user_league_ratings_league_idx ON public.user_league_ratings(league_id, car_class);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_league_ratings TO authenticated;
GRANT ALL ON public.user_league_ratings TO service_role;

ALTER TABLE public.user_league_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own rating readable"
  ON public.user_league_ratings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage ratings (insert)"
  ON public.user_league_ratings FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage ratings (update)"
  ON public.user_league_ratings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage ratings (delete)"
  ON public.user_league_ratings FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

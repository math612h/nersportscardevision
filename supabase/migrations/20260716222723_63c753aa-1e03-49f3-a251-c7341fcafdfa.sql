
-- Helper: mandag i ugen (Europe/Copenhagen) som DATE
CREATE OR REPLACE FUNCTION public.overtaking_current_week_start()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (date_trunc('week', (now() AT TIME ZONE 'Europe/Copenhagen')))::date
$$;

-- Clips
CREATE TABLE public.overtaking_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_url text NOT NULL,
  youtube_id text NOT NULL,
  title text,
  week_start date NOT NULL DEFAULT public.overtaking_current_week_start(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX overtaking_clips_week_idx ON public.overtaking_clips(week_start);
CREATE INDEX overtaking_clips_user_idx ON public.overtaking_clips(user_id);

GRANT SELECT ON public.overtaking_clips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overtaking_clips TO authenticated;
GRANT ALL ON public.overtaking_clips TO service_role;

ALTER TABLE public.overtaking_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clips are public readable"
  ON public.overtaking_clips FOR SELECT
  USING (true);

CREATE POLICY "authenticated can insert own clips"
  ON public.overtaking_clips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own clips"
  ON public.overtaking_clips FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete own clips"
  ON public.overtaking_clips FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins manage all clips"
  ON public.overtaking_clips FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER overtaking_clips_touch
  BEFORE UPDATE ON public.overtaking_clips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Votes
CREATE TABLE public.overtaking_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES public.overtaking_clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX overtaking_votes_clip_idx ON public.overtaking_votes(clip_id);
CREATE INDEX overtaking_votes_week_idx ON public.overtaking_votes(week_start);

GRANT SELECT ON public.overtaking_votes TO anon;
GRANT SELECT, INSERT, DELETE ON public.overtaking_votes TO authenticated;
GRANT ALL ON public.overtaking_votes TO service_role;

ALTER TABLE public.overtaking_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes are public readable"
  ON public.overtaking_votes FOR SELECT
  USING (true);

CREATE POLICY "authenticated can vote in current week"
  ON public.overtaking_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND week_start = public.overtaking_current_week_start()
  );

CREATE POLICY "users can remove own current vote"
  ON public.overtaking_votes FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND week_start = public.overtaking_current_week_start()
  );

CREATE POLICY "admins manage all votes"
  ON public.overtaking_votes FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

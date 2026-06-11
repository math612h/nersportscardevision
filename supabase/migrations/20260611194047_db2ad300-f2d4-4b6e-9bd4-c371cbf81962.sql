ALTER TABLE public.league_results
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'race';

ALTER TABLE public.league_results
  DROP CONSTRAINT IF EXISTS league_results_session_type_check;

ALTER TABLE public.league_results
  ADD CONSTRAINT league_results_session_type_check
  CHECK (session_type IN ('race', 'qualifying'));

CREATE INDEX IF NOT EXISTS league_results_division_session_idx
  ON public.league_results (division_id, session_type);
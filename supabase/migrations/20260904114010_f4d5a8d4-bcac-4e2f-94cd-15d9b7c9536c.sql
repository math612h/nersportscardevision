ALTER TABLE public.league_results
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.league_results
  DROP CONSTRAINT IF EXISTS league_results_status_check;

ALTER TABLE public.league_results
  ADD CONSTRAINT league_results_status_check
  CHECK (status IS NULL OR status IN ('classified','ret','dnf','dns','dsq','nt'));
ALTER TABLE public.league_results
  ADD COLUMN IF NOT EXISTS laps integer,
  ADD COLUMN IF NOT EXISTS time_penalty_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_penalty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_penalty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dsq boolean NOT NULL DEFAULT false;
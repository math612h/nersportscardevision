ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS approved_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS briefing_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS waitlist boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_entries_league_waitlist ON public.entries(league_id, waitlist);

ALTER TABLE public.division_lobbies ADD COLUMN IF NOT EXISTS server_name TEXT;
ALTER TABLE public.divisions ADD COLUMN IF NOT EXISTS server_started_at TIMESTAMPTZ;

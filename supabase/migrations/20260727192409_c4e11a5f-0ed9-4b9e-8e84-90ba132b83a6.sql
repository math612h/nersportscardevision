ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS discord_posted_at timestamptz;
UPDATE public.donations SET discord_posted_at = now() WHERE donated_at <= '2026-07-24 06:26:47.852506+00';
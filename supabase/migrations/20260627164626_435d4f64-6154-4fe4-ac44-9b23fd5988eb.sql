ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS discord_role_id text,
  ADD COLUMN IF NOT EXISTS discord_category_id text,
  ADD COLUMN IF NOT EXISTS discord_text_channel_id text,
  ADD COLUMN IF NOT EXISTS discord_voice_channel_id text,
  ADD COLUMN IF NOT EXISTS discord_synced_at timestamptz;
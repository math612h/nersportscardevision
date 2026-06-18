ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS discord_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
ALTER TABLE public.broadcast_live_state
  ADD COLUMN IF NOT EXISTS upcoming_video_id text,
  ADD COLUMN IF NOT EXISTS upcoming_title text,
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS upcoming_announced_video_id text,
  ADD COLUMN IF NOT EXISTS upcoming_announced_at timestamptz,
  ADD COLUMN IF NOT EXISTS upcoming_discord_message_id text;
ALTER TABLE public.broadcast_live_state
  ADD COLUMN manual_video_id text,
  ADD COLUMN manual_title text,
  ADD COLUMN manual_enabled boolean NOT NULL DEFAULT false;
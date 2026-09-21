-- Limit public/authenticated read access to non-sensitive columns only.

-- profiles: hide donation amounts and internal donation notes from clients.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, display_name, created_at, lmu_name, avatar_url, bio, achievements,
  updated_at, approved, discord_avatar_url, accepts_danish, media_consent,
  donation_tier, stream_photo_path
) ON public.profiles TO anon, authenticated;

-- broadcast_live_state: hide internal Discord message/announcement bookkeeping.
REVOKE SELECT ON public.broadcast_live_state FROM anon, authenticated;
GRANT SELECT (
  id, platform, is_live, video_id, title, started_at,
  upcoming_video_id, upcoming_title, scheduled_start_at, created_at, updated_at
) ON public.broadcast_live_state TO anon, authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.broadcast_live_state TO service_role;

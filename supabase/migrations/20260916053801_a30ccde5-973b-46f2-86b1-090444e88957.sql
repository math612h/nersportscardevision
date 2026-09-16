-- lovable-cron-fallback-reviewed: 288 runs/day; YouTube offers no reliable go-live webhook, so the live banner and Discord announcement require polling; 5 min keeps the announcement timely.
CREATE TABLE public.broadcast_live_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL UNIQUE,
  is_live boolean NOT NULL DEFAULT false,
  video_id text,
  title text,
  started_at timestamptz,
  announced_at timestamptz,
  discord_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.broadcast_live_state TO anon;
GRANT SELECT ON public.broadcast_live_state TO authenticated;
GRANT ALL ON public.broadcast_live_state TO service_role;

ALTER TABLE public.broadcast_live_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live status is publicly readable"
ON public.broadcast_live_state FOR SELECT
TO anon, authenticated
USING (true);

CREATE TRIGGER trg_broadcast_live_state_updated_at
BEFORE UPDATE ON public.broadcast_live_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.broadcast_live_state (platform, is_live) VALUES ('youtube', false);

SELECT cron.schedule(
  'youtube-live-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--2054928e-8e3d-43f6-95a7-df5aedf97bab.lovable.app/api/public/cron/youtube-live',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
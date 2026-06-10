
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_open_notified_at timestamptz;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing job (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('league-open-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'league-open-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--2054928e-8e3d-43f6-95a7-df5aedf97bab.lovable.app/api/public/cron/league-open',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoeXB4dm9scnVobHhiYXBia2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjM1MzcsImV4cCI6MjA5NTg5OTUzN30.L0LBz1Ey-yawvfkxO_v_vmqbAkVn5hcdfL47kQuJ6vo'
    ),
    body := '{}'::jsonb
  );
  $$
);


SELECT cron.schedule(
  'coaching-rating-requests',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--2054928e-8e3d-43f6-95a7-df5aedf97bab.lovable.app/api/public/cron/coaching-rating-requests',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

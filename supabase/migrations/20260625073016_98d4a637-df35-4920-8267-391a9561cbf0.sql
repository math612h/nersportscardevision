
ALTER TABLE public.leaderboard_times DISABLE TRIGGER USER;

UPDATE public.leaderboard_times
SET game_version = CASE
  WHEN recorded_at >= '2026-06-17' THEN '1.3.3.4'
  WHEN recorded_at >= '2026-06-10' THEN '1.3.3.3'
  WHEN recorded_at >= '2026-06-09' THEN '1.3.3.2'
  WHEN recorded_at >= '2026-06-05' THEN '1.3.3.1'
  WHEN recorded_at >= '2026-06-04' THEN '1.3.3.0'
  WHEN recorded_at >= '2026-05-01' THEN '1.3.2.2'
  WHEN recorded_at >= '2026-04-28' THEN '1.3.2.0'
  WHEN recorded_at >= '2026-04-22' THEN '1.3.1.3'
  WHEN recorded_at >= '2026-04-15' THEN '1.3.1.2'
  WHEN recorded_at >= '2026-04-10' THEN '1.3.1.1'
  WHEN recorded_at >= '2026-04-08' THEN '1.3.1.0'
  WHEN recorded_at >= '2026-04-02' THEN '1.3.0.1'
  WHEN recorded_at >= '2026-03-31' THEN '1.3.0.0'
  WHEN recorded_at >= '2026-03-17' THEN '1.2.4.1'
  WHEN recorded_at >= '2026-03-10' THEN '1.2.4.0'
  WHEN recorded_at >= '2026-02-24' THEN '1.2.3.0'
  WHEN recorded_at >= '2026-01-27' THEN '1.2.2.0'
  WHEN recorded_at >= '2025-12-22' THEN '1.2.1.2'
  WHEN recorded_at >= '2025-12-18' THEN '1.2.1.1'
  WHEN recorded_at >= '2025-12-16' THEN '1.2.1.0'
  WHEN recorded_at >= '2025-12-09' THEN '1.2.0.0'
  WHEN recorded_at >= '2025-11-04' THEN '1.1.2.0'
  WHEN recorded_at >= '2025-10-14' THEN '1.1.1.3'
  WHEN recorded_at >= '2025-10-07' THEN '1.1.1.2'
  WHEN recorded_at >= '2025-10-02' THEN '1.1.1.1'
  WHEN recorded_at >= '2025-09-30' THEN '1.1.1.0'
  WHEN recorded_at >= '2025-09-16' THEN '1.1.0.2'
  WHEN recorded_at >= '2025-09-11' THEN '1.1.0.1'
  WHEN recorded_at >= '2025-09-09' THEN '1.1.0.0'
  WHEN recorded_at >= '2025-08-26' THEN '1.0.2.2'
  WHEN recorded_at >= '2025-08-21' THEN '1.0.2.1'
  WHEN recorded_at >= '2025-08-19' THEN '1.0.2.0'
  WHEN recorded_at >= '2025-08-05' THEN '1.0.1.2'
  WHEN recorded_at >= '2025-07-31' THEN '1.0.1.1'
  WHEN recorded_at >= '2025-07-29' THEN '1.0.1.0'
  WHEN recorded_at >= '2025-07-22' THEN '1.0.0.0'
  ELSE NULL
END
WHERE game_version IS NULL;

ALTER TABLE public.leaderboard_times ENABLE TRIGGER USER;

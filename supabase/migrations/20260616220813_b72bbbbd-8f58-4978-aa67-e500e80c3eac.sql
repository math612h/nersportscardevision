ALTER TABLE public.leagues
  DROP COLUMN IF EXISTS car_lock_after_division_count,
  ADD COLUMN IF NOT EXISTS car_lock_at timestamptz;

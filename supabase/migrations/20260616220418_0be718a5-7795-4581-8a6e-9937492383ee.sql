ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS car_lock_never boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS car_lock_after_division_count integer NOT NULL DEFAULT 1
    CHECK (car_lock_after_division_count >= 1);

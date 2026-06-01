ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS car_class text,
  ADD COLUMN IF NOT EXISTS driver_category text;
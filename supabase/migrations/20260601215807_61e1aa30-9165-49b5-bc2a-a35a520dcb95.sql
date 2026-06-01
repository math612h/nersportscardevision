
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS class_configs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS league_id uuid;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS car_number integer;
ALTER TABLE public.entries ALTER COLUMN division_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entries_league_car_number_uniq
  ON public.entries (league_id, car_number)
  WHERE league_id IS NOT NULL AND car_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entries_league_user_uniq
  ON public.entries (league_id, user_id)
  WHERE league_id IS NOT NULL AND division_id IS NULL;

DROP INDEX IF EXISTS public.entries_league_car_number_uniq;
CREATE UNIQUE INDEX entries_league_car_number_uniq
  ON public.entries USING btree (league_id, car_number)
  WHERE (league_id IS NOT NULL AND car_number IS NOT NULL AND division_id IS NULL);
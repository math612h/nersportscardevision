ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE public.league_team_lineup ADD COLUMN IF NOT EXISTS effective_until timestamptz;

DROP INDEX IF EXISTS public.entries_league_car_number_uniq;
CREATE UNIQUE INDEX entries_league_car_number_uniq ON public.entries USING btree (league_id, car_number)
  WHERE (league_id IS NOT NULL AND car_number IS NOT NULL AND division_id IS NULL AND withdrawn_at IS NULL);

DROP INDEX IF EXISTS public.entries_league_user_uniq;
CREATE UNIQUE INDEX entries_league_user_uniq ON public.entries USING btree (league_id, user_id)
  WHERE (league_id IS NOT NULL AND division_id IS NULL AND withdrawn_at IS NULL);

CREATE INDEX IF NOT EXISTS entries_withdrawn_idx ON public.entries (league_id) WHERE withdrawn_at IS NOT NULL;

INSERT INTO public.entries (league_id, user_id, driver_name, car_class, driver_category, car_number, waitlist, withdrawn_at, created_at)
SELECT '68f86ec5-e84f-4110-b232-27bdc33aaadb', 'a400010e-4d85-45d8-8102-dc0d7337abeb', 'Kenneth Dahl Pedersen', 'LMGT3', 'Pro', 134, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.entries
  WHERE league_id = '68f86ec5-e84f-4110-b232-27bdc33aaadb'
    AND user_id = 'a400010e-4d85-45d8-8102-dc0d7337abeb'
    AND division_id IS NULL
);
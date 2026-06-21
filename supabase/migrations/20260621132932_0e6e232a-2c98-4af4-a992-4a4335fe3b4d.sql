
ALTER TABLE public.league_team_entries ADD COLUMN car_class text NOT NULL;
ALTER TABLE public.league_team_entries DROP CONSTRAINT league_team_entries_league_id_team_id_key;
ALTER TABLE public.league_team_entries ADD CONSTRAINT league_team_entries_league_team_class_key UNIQUE (league_id, team_id, car_class);

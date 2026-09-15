ALTER TABLE public.league_team_lineup
  ADD COLUMN IF NOT EXISTS effective_from timestamptz;

COMMENT ON COLUMN public.league_team_lineup.effective_from IS
  'NULL = gælder fra sæsonstart. Ellers tæller køreren kun med i team-resultater for afdelinger med race_date >= denne værdi.';
CREATE OR REPLACE FUNCTION public.sync_entry_team_from_lineup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lte record;
BEGIN
  SELECT league_id, team_id, car_class INTO lte FROM public.league_team_entries WHERE id = NEW.league_team_entry_id;
  IF lte IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'accepted' AND NEW.effective_until IS NULL THEN
    UPDATE public.entries SET team_id = lte.team_id
     WHERE user_id = NEW.user_id AND league_id = lte.league_id AND car_class = lte.car_class
       AND withdrawn_at IS NULL AND division_id IS NULL AND team_id IS DISTINCT FROM lte.team_id;
  ELSIF NEW.effective_until IS NOT NULL OR NEW.status = 'declined' THEN
    UPDATE public.entries SET team_id = NULL
     WHERE user_id = NEW.user_id AND league_id = lte.league_id AND car_class = lte.car_class
       AND withdrawn_at IS NULL AND division_id IS NULL AND team_id = lte.team_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_entry_team_from_lineup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sync_entry_team_from_lineup
AFTER INSERT OR UPDATE OF status, effective_until ON public.league_team_lineup
FOR EACH ROW EXECUTE FUNCTION public.sync_entry_team_from_lineup();
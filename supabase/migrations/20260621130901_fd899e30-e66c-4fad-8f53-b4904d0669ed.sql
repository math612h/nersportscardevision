
DO $$ BEGIN
  CREATE TYPE public.league_team_entry_status AS ENUM ('pending','confirmed','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.league_team_lineup_status AS ENUM ('invited','accepted','declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.league_team_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.league_team_entry_status NOT NULL DEFAULT 'pending',
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, team_id)
);
CREATE INDEX IF NOT EXISTS league_team_entries_league_idx ON public.league_team_entries(league_id);
CREATE INDEX IF NOT EXISTS league_team_entries_team_idx ON public.league_team_entries(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_team_entries TO authenticated;
GRANT ALL ON public.league_team_entries TO service_role;
GRANT SELECT ON public.league_team_entries TO anon;

ALTER TABLE public.league_team_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team entries readable by anon" ON public.league_team_entries FOR SELECT TO anon USING (true);
CREATE POLICY "Team entries readable by auth" ON public.league_team_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner/admin insert team entry" ON public.league_team_entries
  FOR INSERT TO authenticated
  WITH CHECK (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner/admin update team entry" ON public.league_team_entries
  FOR UPDATE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner/admin delete team entry" ON public.league_team_entries
  FOR DELETE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_league_team_entries_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER league_team_entries_touch_updated_at
  BEFORE UPDATE ON public.league_team_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_league_team_entries_updated_at();

-- Lineup table (denormalized league_id for unique constraint)
CREATE TABLE IF NOT EXISTS public.league_team_lineup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_team_entry_id uuid NOT NULL REFERENCES public.league_team_entries(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.league_team_lineup_status NOT NULL DEFAULT 'invited',
  discord_channel_id text,
  discord_message_id text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_team_entry_id, user_id)
);
CREATE INDEX IF NOT EXISTS league_team_lineup_user_idx ON public.league_team_lineup(user_id);
CREATE INDEX IF NOT EXISTS league_team_lineup_entry_idx ON public.league_team_lineup(league_team_entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS league_team_lineup_active_user_per_league_uniq
  ON public.league_team_lineup (league_id, user_id) WHERE status IN ('invited','accepted');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_team_lineup TO authenticated;
GRANT ALL ON public.league_team_lineup TO service_role;
GRANT SELECT ON public.league_team_lineup TO anon;

ALTER TABLE public.league_team_lineup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lineup readable by anon" ON public.league_team_lineup FOR SELECT TO anon USING (true);
CREATE POLICY "Lineup readable by auth" ON public.league_team_lineup FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner/admin insert lineup" ON public.league_team_lineup
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.league_team_entries lte
            WHERE lte.id = league_team_entry_id
              AND (private.is_team_owner(lte.team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Owner/admin or invitee update lineup" ON public.league_team_lineup
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.league_team_entries lte
               WHERE lte.id = league_team_entry_id
                 AND (private.is_team_owner(lte.team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role)))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.league_team_entries lte
               WHERE lte.id = league_team_entry_id
                 AND (private.is_team_owner(lte.team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Owner/admin delete lineup" ON public.league_team_lineup
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.league_team_entries lte
            WHERE lte.id = league_team_entry_id
              AND (private.is_team_owner(lte.team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE OR REPLACE FUNCTION public.touch_league_team_lineup_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER league_team_lineup_touch_updated_at
  BEFORE UPDATE ON public.league_team_lineup
  FOR EACH ROW EXECUTE FUNCTION public.touch_league_team_lineup_updated_at();

-- Sync league_id from entry on insert to prevent drift
CREATE OR REPLACE FUNCTION public.sync_league_team_lineup_league_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _lid uuid;
BEGIN
  SELECT league_id INTO _lid FROM public.league_team_entries WHERE id = NEW.league_team_entry_id;
  IF _lid IS NULL THEN
    RAISE EXCEPTION 'Ugyldig league_team_entry_id';
  END IF;
  NEW.league_id := _lid;
  RETURN NEW;
END $$;

CREATE TRIGGER league_team_lineup_sync_league_id
  BEFORE INSERT OR UPDATE ON public.league_team_lineup
  FOR EACH ROW EXECUTE FUNCTION public.sync_league_team_lineup_league_id();

-- =========================================================
-- Helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.league_is_active(_league_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT count(*) AS total FROM public.divisions WHERE league_id = _league_id),
       r AS (SELECT count(DISTINCT round) AS done FROM public.league_results WHERE league_id = _league_id AND round IS NOT NULL)
  SELECT (SELECT done FROM r) > 0 AND (SELECT done FROM r) < (SELECT total FROM d);
$$;

CREATE OR REPLACE FUNCTION public.user_locked_team(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lte.team_id
    FROM public.league_team_lineup l
    JOIN public.league_team_entries lte ON lte.id = l.league_team_entry_id
   WHERE l.user_id = _user_id
     AND l.status = 'accepted'
     AND lte.status = 'confirmed'
     AND public.league_is_active(lte.league_id)
   LIMIT 1;
$$;

-- =========================================================
-- Triggers: block leaving/switching/joining while locked
-- =========================================================
CREATE OR REPLACE FUNCTION public.block_team_member_change_when_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE locked_team uuid;
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    locked_team := public.user_locked_team(OLD.user_id);
    IF locked_team = OLD.team_id THEN
      RAISE EXCEPTION 'Du kan ikke forlade dit team mens du er bekræftet på et lineup i en aktiv liga' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    locked_team := public.user_locked_team(OLD.user_id);
    IF locked_team IS NOT NULL THEN
      RAISE EXCEPTION 'Du kan ikke skifte team mens du er bekræftet på et lineup i en aktiv liga' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_members_block_when_locked ON public.team_members;
CREATE TRIGGER team_members_block_when_locked
  BEFORE DELETE OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.block_team_member_change_when_locked();

CREATE OR REPLACE FUNCTION public.block_team_join_when_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE locked_team uuid;
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'accepted'::team_request_status) THEN
    locked_team := public.user_locked_team(NEW.user_id);
    IF locked_team IS NOT NULL AND locked_team IS DISTINCT FROM NEW.team_id THEN
      RAISE EXCEPTION 'Brugeren er låst til et andet team indtil deres aktive liga er færdig' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_applications_block_when_locked ON public.team_applications;
CREATE TRIGGER team_applications_block_when_locked
  BEFORE INSERT OR UPDATE ON public.team_applications
  FOR EACH ROW EXECUTE FUNCTION public.block_team_join_when_locked();

DROP TRIGGER IF EXISTS team_invitations_block_when_locked ON public.team_invitations;
CREATE TRIGGER team_invitations_block_when_locked
  BEFORE INSERT OR UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION public.block_team_join_when_locked();

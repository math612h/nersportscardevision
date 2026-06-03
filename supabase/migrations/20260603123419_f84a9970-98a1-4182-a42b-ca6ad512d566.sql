
-- 1. TEAMS
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  bio text,
  logo_url text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams readable by anon" ON public.teams FOR SELECT TO anon USING (true);
CREATE POLICY "Teams readable by authenticated" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Approved users create teams" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.approved = true));
CREATE POLICY "Owner or admin updates team" ON public.teams FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner or admin deletes team" ON public.teams FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_updated_at();

-- 2. TEAM MEMBERS
CREATE TYPE public.team_member_role AS ENUM ('owner', 'member');

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.team_member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT ON public.team_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- helper: is_team_member
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id) $$;

CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id AND owner_id = _user_id) $$;

REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM PUBLIC, anon;

CREATE POLICY "Team members readable by anon" ON public.team_members FOR SELECT TO anon USING (true);
CREATE POLICY "Team members readable by authenticated" ON public.team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner or admin insert members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner, self, or admin removes member" ON public.team_members FOR DELETE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

-- enforce max 3 teams per user
CREATE OR REPLACE FUNCTION public.enforce_max_teams_per_user()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.team_members WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION 'Du kan maks være medlem af 3 teams';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_team_member_limit BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_teams_per_user();

-- auto-add owner as member when team is created
CREATE OR REPLACE FUNCTION public.add_owner_as_team_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.team_members (team_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END $$;
CREATE TRIGGER add_owner_after_team_insert AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_team_member();

-- 3. APPLICATIONS (user -> team)
CREATE TYPE public.team_request_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE public.team_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text,
  status public.team_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (team_id, user_id, status)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_applications TO authenticated;
GRANT ALL ON public.team_applications TO service_role;
ALTER TABLE public.team_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner, applicant, admin read applications" ON public.team_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own application" ON public.team_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner, applicant, admin update application" ON public.team_applications FOR UPDATE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner, applicant, admin delete application" ON public.team_applications FOR DELETE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

-- 4. INVITATIONS (team -> user)
CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  status public.team_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (team_id, user_id, status)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invitations TO authenticated;
GRANT ALL ON public.team_invitations TO service_role;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner, invitee, admin read invitations" ON public.team_invitations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner inserts invitations" ON public.team_invitations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = invited_by AND (public.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Owner, invitee, admin update invitation" ON public.team_invitations FOR UPDATE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner, invitee, admin delete invitation" ON public.team_invitations FOR DELETE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

-- 5. TEAM MESSAGES (chat)
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_messages_team_created_idx ON public.team_messages (team_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.team_messages TO authenticated;
GRANT ALL ON public.team_messages TO service_role;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read team messages" ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members insert team messages" ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_team_member(team_id, auth.uid()));
CREATE POLICY "Author, owner, admin delete team messages" ON public.team_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER TABLE public.team_messages REPLICA IDENTITY FULL;

-- notify other team members on new message
CREATE OR REPLACE FUNCTION public.notify_team_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  team_name text;
  sender_name text;
BEGIN
  SELECT name INTO team_name FROM public.teams WHERE id = NEW.team_id;
  SELECT COALESCE(display_name, 'Et medlem') INTO sender_name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, title, body, link)
  SELECT tm.user_id,
         'Ny besked i ' || team_name,
         sender_name || ': ' || left(NEW.content, 100),
         '/teams/' || NEW.team_id
  FROM public.team_members tm
  WHERE tm.team_id = NEW.team_id AND tm.user_id <> NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER notify_on_team_message AFTER INSERT ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_team_message();

-- 6. ENTRIES: add team_id
ALTER TABLE public.entries ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX entries_team_id_idx ON public.entries (team_id);

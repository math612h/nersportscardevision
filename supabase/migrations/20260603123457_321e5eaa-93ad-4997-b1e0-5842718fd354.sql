
-- Recreate helpers in private schema
CREATE OR REPLACE FUNCTION private.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id) $$;

CREATE OR REPLACE FUNCTION private.is_team_owner(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id AND owner_id = _user_id) $$;

-- Update all policies to use private.* helpers
DROP POLICY "Owner or admin insert members" ON public.team_members;
CREATE POLICY "Owner or admin insert members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner, self, or admin removes member" ON public.team_members;
CREATE POLICY "Owner, self, or admin removes member" ON public.team_members FOR DELETE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner, applicant, admin read applications" ON public.team_applications;
CREATE POLICY "Owner, applicant, admin read applications" ON public.team_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner, applicant, admin update application" ON public.team_applications;
CREATE POLICY "Owner, applicant, admin update application" ON public.team_applications FOR UPDATE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner, applicant, admin delete application" ON public.team_applications;
CREATE POLICY "Owner, applicant, admin delete application" ON public.team_applications FOR DELETE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner, invitee, admin read invitations" ON public.team_invitations;
CREATE POLICY "Owner, invitee, admin read invitations" ON public.team_invitations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner inserts invitations" ON public.team_invitations;
CREATE POLICY "Owner inserts invitations" ON public.team_invitations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = invited_by AND (private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY "Owner, invitee, admin update invitation" ON public.team_invitations;
CREATE POLICY "Owner, invitee, admin update invitation" ON public.team_invitations FOR UPDATE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Owner, invitee, admin delete invitation" ON public.team_invitations;
CREATE POLICY "Owner, invitee, admin delete invitation" ON public.team_invitations FOR DELETE TO authenticated
  USING (private.is_team_owner(team_id, auth.uid()) OR auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Members read team messages" ON public.team_messages;
CREATE POLICY "Members read team messages" ON public.team_messages FOR SELECT TO authenticated
  USING (private.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Members insert team messages" ON public.team_messages;
CREATE POLICY "Members insert team messages" ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND private.is_team_member(team_id, auth.uid()));

DROP POLICY "Author, owner, admin delete team messages" ON public.team_messages;
CREATE POLICY "Author, owner, admin delete team messages" ON public.team_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR private.is_team_owner(team_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

-- Drop public copies
DROP FUNCTION public.is_team_member(uuid, uuid);
DROP FUNCTION public.is_team_owner(uuid, uuid);

-- Trigger functions: revoke from anon and authenticated (only triggers call them)
REVOKE EXECUTE ON FUNCTION public.enforce_max_teams_per_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_owner_as_team_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_team_message() FROM PUBLIC, anon, authenticated;


DROP POLICY IF EXISTS "Entries readable by anon" ON public.entries;
REVOKE SELECT ON public.entries FROM anon;

DROP POLICY IF EXISTS "Owner, invitee, admin update invitation" ON public.team_invitations;

CREATE POLICY "Owner or admin update invitation"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (
  private.is_team_owner(team_id, auth.uid())
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.is_team_owner(team_id, auth.uid())
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Invitee respond to invitation"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('accepted'::team_request_status, 'rejected'::team_request_status)
  AND EXISTS (
    SELECT 1 FROM public.team_invitations ti
    WHERE ti.id = team_invitations.id
      AND ti.team_id = team_invitations.team_id
      AND ti.user_id = team_invitations.user_id
      AND ti.invited_by IS NOT DISTINCT FROM team_invitations.invited_by
      AND ti.created_at = team_invitations.created_at
  )
);

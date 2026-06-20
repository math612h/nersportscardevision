CREATE POLICY "Team owner inserts member from application"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_team_owner(team_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.team_applications ta
    WHERE ta.team_id = team_members.team_id
      AND ta.user_id = team_members.user_id
      AND ta.status IN ('pending'::team_request_status, 'accepted'::team_request_status)
  )
);
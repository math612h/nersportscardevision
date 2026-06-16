DO $$
DECLARE
  pol_def text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) || ' WITH CHECK ' || pg_get_expr(polwithcheck, polrelid)
    INTO pol_def
  FROM pg_policy
  WHERE polname = 'Admin or self-accepted-invitation insert members'
    AND polrelid = 'public.team_members'::regclass;
END $$;

DROP POLICY IF EXISTS "Admin or self-accepted-invitation insert members" ON public.team_members;

CREATE POLICY "Admin or self-accepted-invitation insert members"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_invitations ti
      WHERE ti.team_id = team_members.team_id
        AND ti.user_id = auth.uid()
        AND ti.status = 'accepted'::team_request_status
    )
  )
);
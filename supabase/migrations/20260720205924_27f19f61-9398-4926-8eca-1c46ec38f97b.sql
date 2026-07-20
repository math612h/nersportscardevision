
DROP POLICY IF EXISTS "Owner/admin insert team entry" ON public.league_team_entries;
CREATE POLICY "Owner/admin insert team entry"
  ON public.league_team_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_team_owner(team_id, auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

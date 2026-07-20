
-- Fix profiles: enforce approved=false on self-insert (admins bypass via separate insert path)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND approved = false
  );

-- Fix league_team_entries: non-admin inserts must be status='pending'
DROP POLICY IF EXISTS "Owner/admin insert team entry" ON public.league_team_entries;
CREATE POLICY "Owner/admin insert team entry"
  ON public.league_team_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      private.is_team_owner(team_id, auth.uid())
      AND status = 'pending'
    )
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

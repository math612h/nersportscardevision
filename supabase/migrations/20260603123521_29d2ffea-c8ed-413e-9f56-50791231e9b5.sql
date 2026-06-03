
CREATE POLICY "Team logos readable by anyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-logos');

CREATE POLICY "Team owner uploads team logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'team-logos'
  AND (
    private.is_team_owner(((storage.foldername(name))[1])::uuid, auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Team owner updates team logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'team-logos'
  AND (
    private.is_team_owner(((storage.foldername(name))[1])::uuid, auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Team owner deletes team logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'team-logos'
  AND (
    private.is_team_owner(((storage.foldername(name))[1])::uuid, auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);


GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated;

CREATE POLICY "Admins can read division replays"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'division-replays' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can upload division replays"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'division-replays' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete division replays"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'division-replays' AND private.has_role(auth.uid(), 'admin'::app_role));

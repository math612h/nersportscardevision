CREATE POLICY "Admins og stewards kan hente replay-filer"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'replays' AND (private.has_role(auth.uid(), 'admin'::app_role) OR public.is_steward(auth.uid())));

CREATE POLICY "Admins kan uploade replay-filer"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'replays' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins kan opdatere replay-filer"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'replays' AND private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'replays' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins kan slette replay-filer"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'replays' AND private.has_role(auth.uid(), 'admin'::app_role));
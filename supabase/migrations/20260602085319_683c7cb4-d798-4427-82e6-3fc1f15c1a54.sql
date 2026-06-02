
CREATE POLICY "Track images viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'track-images');

CREATE POLICY "Admins upload track images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'track-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update track images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'track-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete track images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'track-images' AND private.has_role(auth.uid(), 'admin'::app_role));

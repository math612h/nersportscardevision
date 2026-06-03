
CREATE POLICY "League banners readable by anyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'league-banners');

CREATE POLICY "Admins upload league banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'league-banners' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update league banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'league-banners' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete league banners"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'league-banners' AND private.has_role(auth.uid(), 'admin'::app_role));

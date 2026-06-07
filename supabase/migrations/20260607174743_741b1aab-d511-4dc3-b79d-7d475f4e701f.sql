CREATE POLICY "News images are viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'news-images');

CREATE POLICY "Admins can upload news images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'news-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update news images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'news-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete news images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'news-images' AND private.has_role(auth.uid(), 'admin'::app_role));
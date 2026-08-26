CREATE POLICY "Anyone can view stream photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'stream-photos');
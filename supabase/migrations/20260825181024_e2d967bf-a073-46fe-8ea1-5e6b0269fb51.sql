ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stream_photo_path text;

CREATE POLICY "Users manage own stream photo" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'stream-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'stream-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff can read stream photos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'stream-photos' AND (private.has_role(auth.uid(), 'admin'::app_role) OR public.is_steward(auth.uid())));
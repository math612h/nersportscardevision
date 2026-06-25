
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.partner_benefits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_path TEXT,
  hero_image_path TEXT,
  body TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_benefits TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.partner_benefits TO authenticated;
GRANT ALL ON public.partner_benefits TO service_role;

ALTER TABLE public.partner_benefits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active partner benefits"
  ON public.partner_benefits FOR SELECT
  USING (active = true OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert partner benefits"
  ON public.partner_benefits FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update partner benefits"
  ON public.partner_benefits FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete partner benefits"
  ON public.partner_benefits FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_partner_benefits_updated_at
  BEFORE UPDATE ON public.partner_benefits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Partner images viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'partner-images');

CREATE POLICY "Admins can upload partner images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'partner-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update partner images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'partner-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete partner images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'partner-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text,
  logo_path text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sponsors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO authenticated;
GRANT ALL ON public.sponsors TO service_role;

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active sponsors viewable by everyone"
  ON public.sponsors FOR SELECT TO anon, authenticated
  USING (active = true OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert sponsors"
  ON public.sponsors FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sponsors"
  ON public.sponsors FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sponsors"
  ON public.sponsors FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_sponsors_updated_at
  BEFORE UPDATE ON public.sponsors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sponsor_settings (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  rotate_seconds integer NOT NULL DEFAULT 10,
  position text NOT NULL DEFAULT 'right',
  show_on_mobile boolean NOT NULL DEFAULT false,
  show_name boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_settings_singleton CHECK (id = 1),
  CONSTRAINT sponsor_settings_position_chk CHECK (position IN ('right','left')),
  CONSTRAINT sponsor_settings_rotate_chk CHECK (rotate_seconds BETWEEN 3 AND 120)
);

GRANT SELECT ON public.sponsor_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.sponsor_settings TO authenticated;
GRANT ALL ON public.sponsor_settings TO service_role;

ALTER TABLE public.sponsor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sponsor settings viewable by everyone"
  ON public.sponsor_settings FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert sponsor settings"
  ON public.sponsor_settings FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sponsor settings"
  ON public.sponsor_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_sponsor_settings_updated_at
  BEFORE UPDATE ON public.sponsor_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sponsor_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE POLICY "Sponsor images viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sponsor-images');

CREATE POLICY "Admins can upload sponsor images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sponsor-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sponsor images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sponsor-images' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sponsor images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sponsor-images' AND private.has_role(auth.uid(), 'admin'::app_role));
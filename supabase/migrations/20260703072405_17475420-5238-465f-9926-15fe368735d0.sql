
CREATE TABLE public.ruleset_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  section_number text NOT NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, section_number)
);
GRANT SELECT ON public.ruleset_sections TO anon, authenticated;
GRANT ALL ON public.ruleset_sections TO authenticated, service_role;
ALTER TABLE public.ruleset_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read ruleset_sections" ON public.ruleset_sections FOR SELECT USING (true);
CREATE POLICY "admin write ruleset_sections" ON public.ruleset_sections
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER ruleset_sections_set_updated_at BEFORE UPDATE ON public.ruleset_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ruleset_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.ruleset_templates(id) ON DELETE CASCADE,
  section_number text NOT NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, section_number)
);
GRANT SELECT ON public.ruleset_template_sections TO authenticated;
GRANT ALL ON public.ruleset_template_sections TO authenticated, service_role;
ALTER TABLE public.ruleset_template_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read ruleset_template_sections" ON public.ruleset_template_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write ruleset_template_sections" ON public.ruleset_template_sections
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER ruleset_template_sections_set_updated_at BEFORE UPDATE ON public.ruleset_template_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

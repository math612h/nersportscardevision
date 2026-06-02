
CREATE TABLE public.ruleset_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ruleset_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruleset_templates TO authenticated;
GRANT ALL ON public.ruleset_templates TO service_role;

ALTER TABLE public.ruleset_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates readable by anon" ON public.ruleset_templates FOR SELECT TO anon USING (true);
CREATE POLICY "Templates readable by authenticated" ON public.ruleset_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert templates" ON public.ruleset_templates FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update templates" ON public.ruleset_templates FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete templates" ON public.ruleset_templates FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.ruleset_template_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.ruleset_templates(id) ON DELETE CASCADE,
  section_number text,
  title text NOT NULL,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ruleset_template_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruleset_template_rules TO authenticated;
GRANT ALL ON public.ruleset_template_rules TO service_role;

ALTER TABLE public.ruleset_template_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Template rules readable by anon" ON public.ruleset_template_rules FOR SELECT TO anon USING (true);
CREATE POLICY "Template rules readable by authenticated" ON public.ruleset_template_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert template rules" ON public.ruleset_template_rules FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update template rules" ON public.ruleset_template_rules FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete template rules" ON public.ruleset_template_rules FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ruleset_template_rules_template ON public.ruleset_template_rules(template_id);

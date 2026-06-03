-- 1) Add points_system to leagues
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS points_system jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Archived points system templates (mirrors ruleset_templates)
CREATE TABLE public.points_system_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  points_per_position integer[] NOT NULL DEFAULT '{}'::integer[],
  fastest_lap_points integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.points_system_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.points_system_templates TO authenticated;
GRANT ALL ON public.points_system_templates TO service_role;

ALTER TABLE public.points_system_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Points templates readable by anon"
  ON public.points_system_templates FOR SELECT TO anon USING (true);
CREATE POLICY "Points templates readable by authenticated"
  ON public.points_system_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert points templates"
  ON public.points_system_templates FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update points templates"
  ON public.points_system_templates FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete points templates"
  ON public.points_system_templates FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

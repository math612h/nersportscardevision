
-- Add off-season flag to leagues
ALTER TABLE public.leagues ADD COLUMN is_offseason boolean NOT NULL DEFAULT false;

-- Absences table
CREATE TABLE public.division_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, user_id)
);

GRANT SELECT ON public.division_absences TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.division_absences TO authenticated;
GRANT ALL ON public.division_absences TO service_role;

ALTER TABLE public.division_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Absences readable by anon"
  ON public.division_absences FOR SELECT TO anon USING (true);

CREATE POLICY "Absences readable by authenticated"
  ON public.division_absences FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own absence"
  ON public.division_absences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users or admin update absence"
  ON public.division_absences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users or admin delete absence"
  ON public.division_absences FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

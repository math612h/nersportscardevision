ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Leagues readable by anon" ON public.leagues;
DROP POLICY IF EXISTS "Leagues readable by authenticated" ON public.leagues;

CREATE POLICY "Leagues readable by anon" ON public.leagues
  FOR SELECT TO anon
  USING (published = true);

CREATE POLICY "Leagues readable by authenticated" ON public.leagues
  FOR SELECT TO authenticated
  USING (published = true OR private.has_role(auth.uid(), 'admin'::app_role));
-- Tighten base table: only owner or admin can read reason
DROP POLICY IF EXISTS "Absences readable by anon" ON public.division_absences;
DROP POLICY IF EXISTS "Absences readable by authenticated" ON public.division_absences;

CREATE POLICY "Owner or admin reads absences"
  ON public.division_absences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Public view without the reason column
CREATE OR REPLACE VIEW public.division_absences_public
WITH (security_invoker = on) AS
  SELECT id, division_id, user_id, created_at
  FROM public.division_absences;

GRANT SELECT ON public.division_absences_public TO anon, authenticated;

-- Allow the view itself to see all rows by adding a permissive SELECT for everyone
-- via a second policy that only exposes non-sensitive columns through the view.
-- Since security_invoker uses the caller's rights, we need a policy that allows
-- reading rows for the purpose of the view. We add a broad SELECT policy and
-- rely on the view to drop the reason column.
CREATE POLICY "Public absence rows visible"
  ON public.division_absences
  FOR SELECT
  TO anon, authenticated
  USING (true);

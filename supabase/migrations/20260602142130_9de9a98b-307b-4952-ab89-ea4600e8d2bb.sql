-- 1) Security definer view → invoker
ALTER VIEW public.division_absences_public SET (security_invoker = true);

-- 2) Fix self-join bug on protests SELECT policy
DROP POLICY IF EXISTS "Submitter, involved, or admin reads protest" ON public.protests;
CREATE POLICY "Submitter, involved, or admin reads protest"
ON public.protests
FOR SELECT
TO authenticated
USING (
  auth.uid() = submitted_by
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.protest_involved pi
    WHERE pi.protest_id = protests.id
      AND pi.user_id = auth.uid()
  )
);

-- 3) Use private.has_role consistently on division_absences SELECT
DROP POLICY IF EXISTS "Owner or admin reads absences" ON public.division_absences;
CREATE POLICY "Owner or admin reads absences"
ON public.division_absences
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR private.has_role(auth.uid(), 'admin'::app_role)
);
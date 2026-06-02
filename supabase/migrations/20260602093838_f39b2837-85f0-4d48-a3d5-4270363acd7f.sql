DROP POLICY IF EXISTS "Public absence rows visible" ON public.division_absences;

-- Recreate view without security_invoker so it bypasses RLS on the base table
-- and only exposes the non-sensitive columns.
DROP VIEW IF EXISTS public.division_absences_public;
CREATE VIEW public.division_absences_public AS
  SELECT id, division_id, user_id, created_at
  FROM public.division_absences;

ALTER VIEW public.division_absences_public OWNER TO postgres;
GRANT SELECT ON public.division_absences_public TO anon, authenticated;

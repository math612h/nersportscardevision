-- Recreate helper in private schema
CREATE OR REPLACE FUNCTION private.user_in_protest(_protest_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protests p
    WHERE p.id = _protest_id AND p.submitted_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.protest_involved pi
    WHERE pi.protest_id = _protest_id AND pi.user_id = _user_id
  )
$$;

-- Update policy to use private function
DROP POLICY IF EXISTS "Read involved rows if part of protest or admin" ON public.protest_involved;
CREATE POLICY "Read involved rows if part of protest or admin"
  ON public.protest_involved FOR SELECT TO authenticated
  USING (private.user_in_protest(protest_id, auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));

-- Drop public copy
DROP FUNCTION IF EXISTS public.user_in_protest(uuid, uuid);
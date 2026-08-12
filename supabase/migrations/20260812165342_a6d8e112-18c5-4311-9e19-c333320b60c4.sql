ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'steward';

CREATE OR REPLACE FUNCTION public.is_steward(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'steward'
  )
$$;

CREATE POLICY "Stewards read all protests"
ON public.protests FOR SELECT TO authenticated
USING (public.is_steward(auth.uid()));

CREATE POLICY "Stewards update protests"
ON public.protests FOR UPDATE TO authenticated
USING (public.is_steward(auth.uid()))
WITH CHECK (public.is_steward(auth.uid()));

CREATE POLICY "Stewards read involved rows"
ON public.protest_involved FOR SELECT TO authenticated
USING (public.is_steward(auth.uid()));
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

ALTER POLICY "Admins manage leagues delete" ON public.leagues
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins manage leagues insert" ON public.leagues
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins manage leagues update" ON public.leagues
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins delete divisions" ON public.divisions
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins insert divisions" ON public.divisions
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins update divisions" ON public.divisions
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins delete rulesets" ON public.rulesets
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins insert rulesets" ON public.rulesets
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins update rulesets" ON public.rulesets
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Users or admin delete entries" ON public.entries
USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Users update own entries" ON public.entries
USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Users or admin delete protests" ON public.protests
USING ((auth.uid() = submitted_by) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Users see own protests or admin sees all" ON public.protests
USING ((auth.uid() = submitted_by) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can read all roles" ON public.user_roles
USING (private.has_role(auth.uid(), 'admin'::public.app_role));
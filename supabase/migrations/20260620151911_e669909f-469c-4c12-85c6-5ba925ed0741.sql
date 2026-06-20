-- Restrict message_templates SELECT to admins
DROP POLICY IF EXISTS "Authenticated can read templates" ON public.message_templates;
CREATE POLICY "Admins can read templates" ON public.message_templates
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Explicit restrictive deny for discord_hosted_sessions client reads
CREATE POLICY "Deny client reads" ON public.discord_hosted_sessions
  AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
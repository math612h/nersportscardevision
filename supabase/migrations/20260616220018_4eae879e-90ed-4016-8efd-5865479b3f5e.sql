-- Add defense-in-depth RESTRICTIVE deny-all policies for anon/authenticated
-- on sensitive email tables, matching the pattern used for email_send_log
-- and email_unsubscribe_tokens.

CREATE POLICY "Deny anon access to email_send_state"
  ON public.email_send_state
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny non-service access to suppressed_emails"
  ON public.suppressed_emails
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

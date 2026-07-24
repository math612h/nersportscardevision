
-- Tighten analytics_events insert policy: session_id required, user_id must match caller (or be null for anon)
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.analytics_events;
CREATE POLICY "Anyone can insert analytics" ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    session_id IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Drop redundant service_role ALL policies with USING(true)/WITH CHECK(true).
-- service_role has BYPASSRLS, so these policies are unnecessary and only trip the linter.
DROP POLICY IF EXISTS "Service role manages send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role manages unsubscribe tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role manages discord strip log" ON public.discord_member_role_strips;

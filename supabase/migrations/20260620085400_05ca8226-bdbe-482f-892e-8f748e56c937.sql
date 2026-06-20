CREATE POLICY "Service role manages discord strip log"
ON public.discord_member_role_strips
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
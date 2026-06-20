
CREATE POLICY "user_rating_history_deny_anon"
ON public.user_rating_history AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

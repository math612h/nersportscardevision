DROP POLICY "Division participants and admins view raised hands" ON public.briefing_raised_hands;
CREATE POLICY "Division participants and admins view raised hands" ON public.briefing_raised_hands
FOR SELECT USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE e.division_id = briefing_raised_hands.division_id
      AND e.user_id = auth.uid()
      AND e.waitlist = false
      AND p.approved = true
  )
);
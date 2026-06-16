-- 1) chat_group_members: restrict DELETE
DROP POLICY IF EXISTS "member can leave or remove others" ON public.chat_group_members;

CREATE POLICY "members can leave; creators/admins can remove others"
ON public.chat_group_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.chat_groups g
    WHERE g.id = chat_group_members.group_id
      AND g.created_by = auth.uid()
  )
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) division_lobbies: scope SELECT explicitly to authenticated
DROP POLICY IF EXISTS "Approved enrolled drivers read division lobby" ON public.division_lobbies;

CREATE POLICY "Approved enrolled drivers read division lobby"
ON public.division_lobbies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.entries e
    JOIN public.profiles p ON p.id = e.user_id
    JOIN public.divisions d ON d.id = e.division_id
    WHERE e.user_id = auth.uid()
      AND p.approved = true
      AND e.waitlist = false
      AND e.division_id = division_lobbies.division_id
      AND d.race_date IS NOT NULL
      AND d.race_date >= now() - interval '6 hours'
      AND d.race_date <= now() + interval '7 days'
  )
);
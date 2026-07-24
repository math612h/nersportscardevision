
-- 1) chat_group_members: replace permissive self-join policy
DROP POLICY IF EXISTS "users can only add themselves" ON public.chat_group_members;

CREATE POLICY "creator or existing member can add members"
ON public.chat_group_members
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.chat_groups g
    WHERE g.id = chat_group_members.group_id AND g.created_by = auth.uid()
  )
  OR public.is_chat_group_member(chat_group_members.group_id, auth.uid())
);

-- 2) profiles: tighten UPDATE WITH CHECK so donation fields and achievements
--    cannot be self-mutated (defense-in-depth alongside existing trigger).
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND approved = (SELECT p.approved FROM public.profiles p WHERE p.id = auth.uid())
  AND donation_tier IS NOT DISTINCT FROM (SELECT p.donation_tier FROM public.profiles p WHERE p.id = auth.uid())
  AND donation_total_dkk IS NOT DISTINCT FROM (SELECT p.donation_total_dkk FROM public.profiles p WHERE p.id = auth.uid())
  AND donation_note IS NOT DISTINCT FROM (SELECT p.donation_note FROM public.profiles p WHERE p.id = auth.uid())
  AND achievements IS NOT DISTINCT FROM (SELECT p.achievements FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS "members can add others" ON public.chat_group_members;

CREATE POLICY "users can only add themselves"
ON public.chat_group_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
-- 1) Drop legacy team chat
DROP TRIGGER IF EXISTS notify_team_message_trigger ON public.team_messages;
DROP FUNCTION IF EXISTS public.notify_team_message() CASCADE;
DROP TABLE IF EXISTS public.team_messages CASCADE;

-- 2) chat_groups
CREATE TABLE public.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_groups TO authenticated;
GRANT ALL ON public.chat_groups TO service_role;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

-- 3) chat_group_members
CREATE TABLE public.chat_group_members (
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX chat_group_members_user_idx ON public.chat_group_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_members TO authenticated;
GRANT ALL ON public.chat_group_members TO service_role;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

-- 4) group_messages
CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_messages_group_created_idx ON public.group_messages(group_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- 5) Helper to check membership (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_chat_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

-- 6) updated_at trigger for chat_groups
CREATE OR REPLACE FUNCTION public.touch_chat_groups_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER chat_groups_touch_updated_at
  BEFORE UPDATE ON public.chat_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_groups_updated_at();

-- 7) Policies: chat_groups
CREATE POLICY "members can view group"
  ON public.chat_groups FOR SELECT
  TO authenticated
  USING (public.is_chat_group_member(id, auth.uid()));

CREATE POLICY "authenticated can create group"
  ON public.chat_groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "members can rename group"
  ON public.chat_groups FOR UPDATE
  TO authenticated
  USING (public.is_chat_group_member(id, auth.uid()))
  WITH CHECK (public.is_chat_group_member(id, auth.uid()));

CREATE POLICY "creator can delete group"
  ON public.chat_groups FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- 8) Policies: chat_group_members
CREATE POLICY "members can view membership"
  ON public.chat_group_members FOR SELECT
  TO authenticated
  USING (public.is_chat_group_member(group_id, auth.uid()));

CREATE POLICY "members can add others"
  ON public.chat_group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_chat_group_member(group_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.created_by = auth.uid()
    )
  );

CREATE POLICY "user can update own membership"
  ON public.chat_group_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "member can leave or remove others"
  ON public.chat_group_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_chat_group_member(group_id, auth.uid())
  );

-- 9) Policies: group_messages
CREATE POLICY "members can read messages"
  ON public.group_messages FOR SELECT
  TO authenticated
  USING (public.is_chat_group_member(group_id, auth.uid()));

CREATE POLICY "members can send messages"
  ON public.group_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_group_member(group_id, auth.uid())
  );

-- 10) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;

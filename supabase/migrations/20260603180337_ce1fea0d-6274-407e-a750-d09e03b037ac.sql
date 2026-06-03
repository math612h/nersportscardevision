
-- 1) protest_involved: trigger to lock fields for non-admins
CREATE OR REPLACE FUNCTION private.protest_involved_lock_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.protest_id IS DISTINCT FROM OLD.protest_id
     OR NEW.driver_name IS DISTINCT FROM OLD.driver_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only response and responded_at may be updated by the involved driver';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protest_involved_lock_fields ON public.protest_involved;
CREATE TRIGGER protest_involved_lock_fields
BEFORE UPDATE ON public.protest_involved
FOR EACH ROW EXECUTE FUNCTION private.protest_involved_lock_fields();

DROP POLICY IF EXISTS "Involved user updates own response" ON public.protest_involved;
CREATE POLICY "Involved user updates own response"
ON public.protest_involved
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

-- 2) team_members: require accepted invitation (or admin) to insert
DROP POLICY IF EXISTS "Owner or admin insert members" ON public.team_members;
CREATE POLICY "Admin or accepted-invitation insert members"
ON public.team_members
FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.team_invitations ti
    WHERE ti.team_id = team_members.team_id
      AND ti.user_id = team_members.user_id
      AND ti.status = 'accepted'::team_request_status
  )
);

-- 3) realtime.messages: default-deny broadcast/presence subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny realtime broadcast/presence by default" ON realtime.messages;
CREATE POLICY "Deny realtime broadcast/presence by default"
ON realtime.messages
FOR SELECT TO authenticated
USING (false);

DROP POLICY IF EXISTS "Deny realtime writes by default" ON realtime.messages;
CREATE POLICY "Deny realtime writes by default"
ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (false);

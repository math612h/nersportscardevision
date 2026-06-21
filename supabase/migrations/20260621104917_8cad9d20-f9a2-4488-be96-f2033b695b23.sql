
CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT,
  actor_id UUID,
  actor_label TEXT,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_table_idx ON public.audit_log (table_name, created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_id, created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_audit(
  _action TEXT,
  _table TEXT,
  _row_id TEXT DEFAULT NULL,
  _old JSONB DEFAULT NULL,
  _new JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _label TEXT;
BEGIN
  SELECT display_name INTO _label FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_log (action, table_name, row_id, actor_id, actor_label, old_data, new_data, metadata)
  VALUES (_action, _table, _row_id, auth.uid(), _label, _old, _new, _metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_row()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _label TEXT;
  _row_id TEXT;
  _old JSONB;
  _new JSONB;
BEGIN
  IF _actor IS NOT NULL THEN
    SELECT display_name INTO _label FROM public.profiles WHERE id = _actor;
  END IF;
  IF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD);
    _row_id := COALESCE(_old->>'id', _old->>'user_id', NULL);
  ELSIF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    _row_id := COALESCE(_new->>'id', _new->>'user_id', NULL);
  ELSE
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _row_id := COALESCE(_new->>'id', _new->>'user_id', NULL);
    IF _old = _new THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.audit_log (action, table_name, row_id, actor_id, actor_label, old_data, new_data)
  VALUES (lower(TG_OP), TG_TABLE_NAME, _row_id, _actor, _label, _old, _new);
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_protests AFTER INSERT OR UPDATE OR DELETE ON public.protests
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_leagues AFTER INSERT OR UPDATE OR DELETE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_divisions AFTER INSERT OR UPDATE OR DELETE ON public.divisions
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_entries AFTER INSERT OR UPDATE OR DELETE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_teams AFTER INSERT OR UPDATE OR DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_team_members AFTER INSERT OR UPDATE OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER audit_news_posts AFTER INSERT OR UPDATE OR DELETE ON public.news_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();

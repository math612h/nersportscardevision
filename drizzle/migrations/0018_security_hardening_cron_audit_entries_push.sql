-- 1) Server-only cron token (never exposed through the Data API)
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.cron_token (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.cron_token FROM PUBLIC, anon, authenticated;
INSERT INTO private.cron_token (id, token)
VALUES (1, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _token IS NOT NULL
     AND length(_token) >= 32
     AND EXISTS (SELECT 1 FROM private.cron_token WHERE id = 1 AND token = _token);
$$;
REVOKE ALL ON FUNCTION public.verify_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_cron_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT token FROM private.cron_token WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION public.get_cron_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_token() TO service_role;

-- 2) Audit log RPC: only admins/stewards (or trusted server code) may write
CREATE OR REPLACE FUNCTION public.log_audit(_action text, _table text, _row_id text DEFAULT NULL::text, _old jsonb DEFAULT NULL::jsonb, _new jsonb DEFAULT NULL::jsonb, _metadata jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _label TEXT;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT private.has_role(auth.uid(), 'admin'::app_role)
     AND NOT private.has_role(auth.uid(), 'steward'::app_role) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR length(_action) > 100 OR _table IS NULL OR length(_table) > 100
     OR (_row_id IS NOT NULL AND length(_row_id) > 300) THEN
    RAISE EXCEPTION 'Invalid audit entry' USING ERRCODE = '22023';
  END IF;
  SELECT display_name INTO _label FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_log (action, table_name, row_id, actor_id, actor_label, old_data, new_data, metadata)
  VALUES (_action, _table, _row_id, auth.uid(), _label, _old, _new, _metadata);
END;
$function$;
REVOKE ALL ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) TO authenticated, service_role;

-- 3) League sign-ups: server decides waitlist/capacity/class rules for ordinary users
CREATE OR REPLACE FUNCTION public.enforce_entry_signup_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _league record;
  _approved boolean;
  _cfg jsonb;
  _split boolean;
  _cap int;
  _taken int;
BEGIN
  -- Trusted server code and admins are not restricted here.
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.league_id IS NULL OR NEW.division_id IS NOT NULL THEN
    RAISE EXCEPTION 'Du kan kun tilmelde dig en liga.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, class_configs, signup_opens_at, approved_only, published
    INTO _league FROM public.leagues WHERE id = NEW.league_id;
  IF NOT FOUND OR COALESCE(_league.published, false) = false THEN
    RAISE EXCEPTION 'Ligaen findes ikke.' USING ERRCODE = 'check_violation';
  END IF;
  IF _league.signup_opens_at IS NOT NULL AND _league.signup_opens_at > now() THEN
    RAISE EXCEPTION 'Tilmelding er ikke åbnet endnu.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(approved, false) INTO _approved FROM public.profiles WHERE id = NEW.user_id;
  _approved := COALESCE(_approved, false);
  IF COALESCE(_league.approved_only, false) AND NOT _approved THEN
    RAISE EXCEPTION 'Denne liga er kun åben for godkendte profiler.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c INTO _cfg
    FROM jsonb_array_elements(COALESCE(_league.class_configs, '[]'::jsonb)) c
   WHERE c->>'car_class' = NEW.car_class
     AND COALESCE(c->>'driver_category', '') = COALESCE(NEW.driver_category, '')
   LIMIT 1;
  IF _cfg IS NULL THEN
    RAISE EXCEPTION 'Ugyldig klasse eller kategori.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.car_number IS NOT NULL
     AND (_cfg ? 'number_from') AND (_cfg ? 'number_to')
     AND (NEW.car_number < (_cfg->>'number_from')::int OR NEW.car_number > (_cfg->>'number_to')::int) THEN
    RAISE EXCEPTION 'Ugyldigt kørenummer.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(DISTINCT COALESCE(c->>'driver_category', '')) > 1 INTO _split
    FROM jsonb_array_elements(_league.class_configs) c
   WHERE c->>'car_class' = NEW.car_class;

  IF _split THEN
    _cap := NULLIF(GREATEST(COALESCE((_cfg->>'max_drivers')::int, 0), 0), 0);
  ELSE
    SELECT CASE WHEN bool_or(COALESCE((c->>'max_drivers')::int, 0) <= 0) THEN NULL
                ELSE sum((c->>'max_drivers')::int) END
      INTO _cap
      FROM jsonb_array_elements(_league.class_configs) c
     WHERE c->>'car_class' = NEW.car_class;
  END IF;

  IF _cap IS NOT NULL THEN
    SELECT count(*) INTO _taken
      FROM public.entries e
     WHERE e.league_id = NEW.league_id
       AND e.car_class = NEW.car_class
       AND (NOT _split OR COALESCE(e.driver_category, '') = COALESCE(NEW.driver_category, ''))
       AND COALESCE(e.waitlist, false) = false
       AND e.withdrawn_at IS NULL;
  END IF;

  NEW.waitlist := COALESCE(NEW.waitlist, false)
                  OR NOT _approved
                  OR (_cap IS NOT NULL AND _taken >= _cap);
  NEW.withdrawn_at := NULL;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_entry_signup_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_entry_signup_rules_trg ON public.entries;
CREATE TRIGGER enforce_entry_signup_rules_trg
BEFORE INSERT ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_entry_signup_rules();

-- 4) Push subscriptions: unique per (user, endpoint) so one user can't take over another's row
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint);
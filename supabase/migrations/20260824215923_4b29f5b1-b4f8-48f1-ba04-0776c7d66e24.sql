-- chr(0) is illegal in PostgreSQL (raises 54000 'null character not permitted'),
-- so this trigger rejected EVERY analytics insert. NUL bytes can never exist in
-- text values anyway (the wire protocol rejects them), so the replace() calls
-- are removed; the client also sanitizes before sending.
CREATE OR REPLACE FUNCTION public.validate_analytics_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.session_id IS NULL OR length(NEW.session_id) > 100 THEN
    RAISE EXCEPTION 'Invalid session_id';
  END IF;
  IF NEW.event_type IS NULL OR length(NEW.event_type) > 50 THEN
    RAISE EXCEPTION 'Invalid event_type';
  END IF;
  IF NEW.path IS NOT NULL AND length(NEW.path) > 500 THEN
    NEW.path := left(NEW.path, 500);
  END IF;
  IF NEW.referrer IS NOT NULL AND length(NEW.referrer) > 500 THEN
    NEW.referrer := left(NEW.referrer, 500);
  END IF;
  IF NEW.user_agent IS NOT NULL AND length(NEW.user_agent) > 500 THEN
    NEW.user_agent := left(NEW.user_agent, 500);
  END IF;
  IF NEW.duration_ms IS NOT NULL AND (NEW.duration_ms < 0 OR NEW.duration_ms > 86400000) THEN
    NEW.duration_ms := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
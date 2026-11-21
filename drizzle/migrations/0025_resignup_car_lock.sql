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
  _prev_car text;
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.league_id IS NULL OR NEW.division_id IS NOT NULL THEN
    RAISE EXCEPTION 'Du kan kun tilmelde dig en liga.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, class_configs, signup_opens_at, approved_only, published, car_lock_never, car_lock_at
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

  -- Genindmelding i samme klasse efter bil-låsen: samme bil som før.
  IF NOT COALESCE(_league.car_lock_never, false)
     AND _league.car_lock_at IS NOT NULL AND _league.car_lock_at <= now() THEN
    SELECT e.car_model INTO _prev_car
      FROM public.entries e
     WHERE e.league_id = NEW.league_id
       AND e.user_id = NEW.user_id
       AND e.car_class = NEW.car_class
       AND e.division_id IS NULL
       AND e.withdrawn_at IS NOT NULL
       AND NULLIF(btrim(e.car_model), '') IS NOT NULL
     ORDER BY e.withdrawn_at DESC
     LIMIT 1;
    IF _prev_car IS NOT NULL AND NEW.car_model IS DISTINCT FROM _prev_car THEN
      RAISE EXCEPTION 'Du har tidligere kørt % i denne klasse og skal tilmelde dig med samme bil.', _prev_car
        USING ERRCODE = 'check_violation';
    END IF;
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

CREATE OR REPLACE FUNCTION public.guard_entry_car_model_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _locked boolean;
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.car_model IS NOT DISTINCT FROM OLD.car_model OR NEW.league_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT NOT COALESCE(l.car_lock_never, false) AND l.car_lock_at IS NOT NULL AND l.car_lock_at <= now()
    INTO _locked FROM public.leagues l WHERE l.id = NEW.league_id;
  IF COALESCE(_locked, false) THEN
    RAISE EXCEPTION 'Bilvalget er låst og kan ikke længere ændres.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_entry_car_model_update_trg ON public.entries;
CREATE TRIGGER guard_entry_car_model_update_trg
  BEFORE UPDATE OF car_model ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_entry_car_model_update();
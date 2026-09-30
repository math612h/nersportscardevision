CREATE OR REPLACE FUNCTION public.enforce_min_leaderboard_times()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cnt int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO cnt
    FROM public.leaderboard_times
   WHERE user_id = NEW.user_id
     AND car_class = ANY(CASE WHEN NEW.car_class IN ('LMP2','LMP2_ELMS')
                              THEN ARRAY['LMP2','LMP2_ELMS']
                              ELSE ARRAY[NEW.car_class] END);
  IF cnt < 10 THEN
    RAISE EXCEPTION 'Du skal have mindst 10 registrerede tider i % i dit personlige leaderboard før du kan tilmelde dig (du har % tider).', NEW.car_class, cnt
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
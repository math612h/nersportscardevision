
-- 1. Log over admin-beskeder til brugere
CREATE TABLE public.admin_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template text NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_message_log_user_template ON public.admin_message_log(user_id, template, sent_at DESC);

GRANT SELECT, INSERT ON public.admin_message_log TO authenticated;
GRANT ALL ON public.admin_message_log TO service_role;

ALTER TABLE public.admin_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin_message_log" ON public.admin_message_log
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert admin_message_log" ON public.admin_message_log
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- 2. Krav om mindst 10 leaderboard-tider i klassen før tilmelding
-- (admin via service_role bypasses via auth.uid() IS NULL)
CREATE OR REPLACE FUNCTION public.enforce_min_leaderboard_times()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  -- Service role (admin server fns via supabaseAdmin) har ingen auth.uid()
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Admins kan tilmelde andre uden krav
  IF private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO cnt
    FROM public.leaderboard_times
   WHERE user_id = NEW.user_id AND car_class = NEW.car_class;
  IF cnt < 10 THEN
    RAISE EXCEPTION 'Du skal have mindst 10 registrerede tider i % i dit personlige leaderboard før du kan tilmelde dig (du har % tider).', NEW.car_class, cnt
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_min_leaderboard_times_trg ON public.entries;
CREATE TRIGGER enforce_min_leaderboard_times_trg
  BEFORE INSERT ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_leaderboard_times();

-- 3. Genberegn ELO så historikken er konsistent med (uændret men nu bekræftet)
-- regel: alle inden for samme car_class i samme race tæller mod hinanden,
-- uanset driver_category (Pro/Am).
SELECT public.recompute_all_elo();

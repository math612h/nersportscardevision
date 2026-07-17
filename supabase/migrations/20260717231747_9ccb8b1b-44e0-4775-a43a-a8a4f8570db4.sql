
CREATE TABLE public.donations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_dkk INTEGER NOT NULL CHECK (amount_dkk > 0),
  note TEXT,
  donated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage donations"
  ON public.donations FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX donations_user_id_idx ON public.donations(user_id);

CREATE OR REPLACE FUNCTION public.recompute_donation_tier(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total INTEGER;
  _tier TEXT;
BEGIN
  SELECT COALESCE(SUM(amount_dkk), 0) INTO _total FROM public.donations WHERE user_id = _user_id;
  _tier := CASE
    WHEN _total > 1000 THEN 'gold'
    WHEN _total > 250 THEN 'silver'
    WHEN _total > 0 THEN 'bronze'
    ELSE NULL
  END;
  UPDATE public.profiles
     SET donation_total_dkk = _total,
         donation_tier = _tier
   WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_donations_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_donation_tier(OLD.user_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.recompute_donation_tier(OLD.user_id);
    PERFORM public.recompute_donation_tier(NEW.user_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_donation_tier(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER donations_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.trg_donations_recompute();

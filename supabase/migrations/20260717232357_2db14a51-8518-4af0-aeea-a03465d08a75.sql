
CREATE OR REPLACE FUNCTION public.recompute_donation_tier(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount_dkk), 0) INTO _total FROM public.donations WHERE user_id = _user_id;
  UPDATE public.profiles
     SET donation_total_dkk = _total,
         donation_tier = (CASE
           WHEN _total > 1000 THEN 'gold'
           WHEN _total > 250 THEN 'silver'
           WHEN _total > 0 THEN 'bronze'
           ELSE NULL
         END)::donation_tier
   WHERE id = _user_id;
END;
$$;

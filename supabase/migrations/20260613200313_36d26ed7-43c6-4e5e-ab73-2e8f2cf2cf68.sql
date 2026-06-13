
CREATE TYPE public.reserve_offer_status AS ENUM ('pending','accepted','declined','expired','superseded');

CREATE TABLE public.division_reserve_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  absentee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  car_class TEXT NOT NULL,
  driver_category TEXT NOT NULL,
  status public.reserve_offer_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (division_id, offered_user_id)
);

CREATE INDEX idx_dro_division_status ON public.division_reserve_offers(division_id, status);
CREATE INDEX idx_dro_offered_status ON public.division_reserve_offers(offered_user_id, status);
CREATE INDEX idx_dro_expires ON public.division_reserve_offers(expires_at) WHERE status = 'pending';

GRANT SELECT, UPDATE ON public.division_reserve_offers TO authenticated;
GRANT ALL ON public.division_reserve_offers TO service_role;

ALTER TABLE public.division_reserve_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Offered user or admin reads reserve offers"
  ON public.division_reserve_offers FOR SELECT
  TO authenticated
  USING (auth.uid() = offered_user_id OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Offered user or admin updates reserve offers"
  ON public.division_reserve_offers FOR UPDATE
  TO authenticated
  USING (auth.uid() = offered_user_id OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = offered_user_id OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_division_reserve_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_dro_touch_updated_at
BEFORE UPDATE ON public.division_reserve_offers
FOR EACH ROW EXECUTE FUNCTION public.touch_division_reserve_offers_updated_at();

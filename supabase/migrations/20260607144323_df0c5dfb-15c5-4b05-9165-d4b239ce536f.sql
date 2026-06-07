CREATE TABLE public.user_class_rating_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  car_class TEXT NOT NULL,
  score NUMERIC NOT NULL,
  percentile NUMERIC,
  confidence NUMERIC,
  components JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_class_rating_history TO authenticated;
GRANT ALL ON public.user_class_rating_history TO service_role;

ALTER TABLE public.user_class_rating_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own rating history"
  ON public.user_class_rating_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_ucrh_user_class_time
  ON public.user_class_rating_history (user_id, car_class, recorded_at);

-- Append a history snapshot whenever a class rating is upserted
CREATE OR REPLACE FUNCTION public.trg_log_class_rating_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip when score is unchanged on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.score IS NOT DISTINCT FROM NEW.score
     AND OLD.percentile IS NOT DISTINCT FROM NEW.percentile THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.user_class_rating_history
    (user_id, car_class, score, percentile, confidence, components, recorded_at)
  VALUES
    (NEW.user_id, NEW.car_class, NEW.score, NEW.percentile, NEW.confidence, NEW.components, now());
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_class_rating_history ON public.user_class_ratings;
CREATE TRIGGER log_class_rating_history
AFTER INSERT OR UPDATE ON public.user_class_ratings
FOR EACH ROW EXECUTE FUNCTION public.trg_log_class_rating_history();

-- Seed history with current ratings so existing users have at least one point
INSERT INTO public.user_class_rating_history
  (user_id, car_class, score, percentile, confidence, components, recorded_at)
SELECT user_id, car_class, score, percentile, confidence, components, COALESCE(updated_at, now())
  FROM public.user_class_ratings;

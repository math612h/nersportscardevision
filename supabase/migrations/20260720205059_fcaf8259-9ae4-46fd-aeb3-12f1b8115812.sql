
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount_dkk integer,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS environment text;

CREATE INDEX IF NOT EXISTS idx_donations_donated_at ON public.donations (donated_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_source ON public.donations (source);

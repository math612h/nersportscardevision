
-- Donations: add source + stripe refs
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'donation',
  ADD COLUMN IF NOT EXISTS stripe_session_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_source_check;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_source_check CHECK (source IN ('donation','coaching'));

-- Allow the trigger's SECURITY DEFINER function to update profiles regardless of caller (already SECURITY DEFINER).

-- Coaching bookings: add amount + payment refs
ALTER TABLE public.coaching_bookings
  ADD COLUMN IF NOT EXISTS amount_dkk integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_session_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

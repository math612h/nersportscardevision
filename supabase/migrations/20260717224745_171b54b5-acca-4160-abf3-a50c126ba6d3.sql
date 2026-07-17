
-- Add donation_tier to profiles
DO $$ BEGIN
  CREATE TYPE public.donation_tier AS ENUM ('bronze','silver','gold');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS donation_tier public.donation_tier NULL,
  ADD COLUMN IF NOT EXISTS donation_total_dkk integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donation_note text NULL;

ALTER TABLE public.leagues ADD COLUMN signup_opens_at TIMESTAMPTZ;
UPDATE public.leagues SET signup_opens_at = created_at WHERE signup_opens_at IS NULL;
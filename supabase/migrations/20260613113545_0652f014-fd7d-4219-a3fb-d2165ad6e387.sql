ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS discord_signup_open_notified_at timestamp with time zone;

COMMENT ON COLUMN public.leagues.discord_signup_open_notified_at IS 'Timestamp for when the signup-open Discord announcement was successfully posted.';
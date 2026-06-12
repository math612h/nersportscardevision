
ALTER TABLE public.profiles_private
  ADD COLUMN IF NOT EXISTS discord_user_id text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS discord_linked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_private_discord_user_id_key
  ON public.profiles_private (discord_user_id)
  WHERE discord_user_id IS NOT NULL;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS discord_role_id text;

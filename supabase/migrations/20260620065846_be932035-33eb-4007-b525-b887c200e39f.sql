CREATE TABLE IF NOT EXISTS public.discord_member_role_strips (
  discord_user_id text NOT NULL,
  joined_at timestamptz NOT NULL,
  removed_role boolean NOT NULL DEFAULT false,
  processed_at timestamptz NOT NULL DEFAULT now(),
  error text,
  PRIMARY KEY (discord_user_id, joined_at)
);

GRANT ALL ON public.discord_member_role_strips TO service_role;

ALTER TABLE public.discord_member_role_strips ENABLE ROW LEVEL SECURITY;
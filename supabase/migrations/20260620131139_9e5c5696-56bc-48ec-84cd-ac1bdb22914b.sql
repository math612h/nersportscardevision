CREATE TABLE public.discord_hosted_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  message_id text NOT NULL,
  delete_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.discord_hosted_sessions TO service_role;
ALTER TABLE public.discord_hosted_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX discord_hosted_sessions_delete_at_idx ON public.discord_hosted_sessions (delete_at);
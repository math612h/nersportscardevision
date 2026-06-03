-- Device tokens table: lets desktop companion app authenticate uploads
CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX device_tokens_user_id_idx ON public.device_tokens(user_id);

GRANT SELECT, INSERT, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can see metadata about their own tokens (name, created_at, last_used_at) but token_hash is one-way
CREATE POLICY "Users read own device tokens"
ON public.device_tokens FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own device tokens"
ON public.device_tokens FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own device tokens"
ON public.device_tokens FOR DELETE TO authenticated
USING (auth.uid() = user_id);

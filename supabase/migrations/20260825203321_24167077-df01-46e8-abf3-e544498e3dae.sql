ALTER TABLE public.division_lobbies
  ADD COLUMN IF NOT EXISTS am_server_name text,
  ADD COLUMN IF NOT EXISTS am_lobby_code text,
  ADD COLUMN IF NOT EXISTS am_lobby_password text;
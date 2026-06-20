ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS message_templates_league_id_idx ON public.message_templates(league_id);
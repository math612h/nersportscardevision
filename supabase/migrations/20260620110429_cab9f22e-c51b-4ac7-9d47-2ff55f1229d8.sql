ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'discord';

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_kind_check;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_kind_check
  CHECK (kind IN ('discord','email'));

INSERT INTO public.message_templates (key, title, body, is_system, kind) VALUES
  (
    'email_welcome_generic',
    'Velkommen til LMU Danmark',
    E'Hej!\n\nVelkommen til LMU Danmark — vi er glade for at have dig med.\n\nHusk at færdiggøre din profil og at tilmelde dig vores Discord her: {discord_invite}\n\nVi ses på banen!\n\n— LMU Danmark',
    true,
    'email'
  )
ON CONFLICT (key) DO NOTHING;
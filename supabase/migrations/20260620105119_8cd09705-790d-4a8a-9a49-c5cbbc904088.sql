-- 1) message_templates table
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  default_channel_id TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.message_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read templates"
ON public.message_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert templates"
ON public.message_templates FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update templates"
ON public.message_templates FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete non-system templates"
ON public.message_templates FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) AND is_system = false);

CREATE TRIGGER touch_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_updated_at();

-- 2) Seed system templates
INSERT INTO public.message_templates (key, title, body, is_system) VALUES
  (
    'wrong_name_in_guild',
    'Opdater dit navn for at blive godkendt',
    'Hej! For at blive godkendt som kører på LMU Danmark skal du registrere dig med dit rigtige for- og efternavn (uden forkortelser, kælenavne eller initialer), og det samme navn skal stå som dit server-nickname på vores Discord-server (ikke din globale Discord-profil). Vi bruger navnet til at koble din bruger på hjemmesiden sammen med din Discord-bruger.\n\nGå til din profil og opdater dit visningsnavn — og ret samtidig dit server-nickname på LMU Danmark Discord-serveren — så godkender vi dig hurtigst muligt.',
    true
  ),
  (
    'wrong_name_not_in_guild',
    'Opdater dit navn for at blive godkendt',
    'Hej! For at blive godkendt som kører på LMU Danmark skal to ting være på plads:\n\n1) Du skal være medlem af vores Discord-server. Du kan tilmelde dig her: {discord_invite}\n\n2) Du skal registrere dig med dit rigtige for- og efternavn, og det samme navn skal stå som dit server-nickname på vores Discord-server.\n\nGå til din profil og opdater dit visningsnavn — og ret samtidig dit server-nickname på LMU Danmark Discord-serveren — så godkender vi dig hurtigst muligt.',
    true
  ),
  (
    'profile_approved',
    'Din profil er godkendt',
    'Hej! Din profil på LMU Danmark er nu godkendt. Du kan nu tilmelde dig ligaer og deltage i kampene. Gå til liga-oversigten og find en liga der passer til dig.',
    true
  ),
  (
    'discord_welcome',
    'Velkommen til LMU Danmark',
    'Velkommen til LMU Danmark! 🏁\n\nFor at blive medlem skal du klikke på knappen herunder og skrive dit rigtige for- og efternavn. Det bliver brugt som dit server-nickname og kobles til din bruger på hjemmesiden.',
    true
  )
ON CONFLICT (key) DO NOTHING;

-- 3) accepts_danish flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accepts_danish BOOLEAN NOT NULL DEFAULT false;
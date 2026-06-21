INSERT INTO public.message_templates (key, title, body)
VALUES (
  'missing_lmu_name',
  'Tilføj dit LMU-navn',
  'Hej! For at blive godkendt som kører på LMU Danmark skal du tilføje dit LMU-navn på din profil. Det er det navn du bruger i spillet, og vi bruger det til at matche dine resultater. Du kan opdatere det her: https://lmudanmark.dk/profil'
)
ON CONFLICT (key) DO NOTHING;
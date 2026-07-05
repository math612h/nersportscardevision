GRANT SELECT ON public.rulesets TO anon, authenticated;
GRANT SELECT ON public.ruleset_sections TO anon, authenticated;
GRANT ALL ON public.rulesets TO service_role;
GRANT ALL ON public.ruleset_sections TO service_role;

ALTER TABLE public.profiles_private
  ADD COLUMN IF NOT EXISTS address_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.cleanup_inactive_addresses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  affected integer;
BEGIN
  WITH inactive AS (
    SELECT u.id
      FROM auth.users u
     WHERE COALESCE(u.last_sign_in_at, u.created_at) < now() - interval '1 year'
  )
  UPDATE public.profiles_private pp
     SET address = NULL,
         postal_code = NULL,
         city = NULL,
         country = NULL,
         address_consent_at = NULL,
         updated_at = now()
   WHERE pp.user_id IN (SELECT id FROM inactive)
     AND (pp.address IS NOT NULL OR pp.postal_code IS NOT NULL OR pp.city IS NOT NULL);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-cleanup-inactive-addresses') THEN
    PERFORM cron.unschedule('gdpr-cleanup-inactive-addresses');
  END IF;
  PERFORM cron.schedule(
    'gdpr-cleanup-inactive-addresses',
    '0 3 * * 0',
    $cron$ SELECT public.cleanup_inactive_addresses(); $cron$
  );
END $$;

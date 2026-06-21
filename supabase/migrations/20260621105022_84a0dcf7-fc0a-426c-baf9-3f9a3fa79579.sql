
CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron
AS $$
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY SELECT j.jobid, j.jobname, j.schedule, j.command, j.active FROM cron.job j ORDER BY j.jobname;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_cron_runs(_limit int DEFAULT 100)
RETURNS TABLE(jobid bigint, jobname text, status text, return_message text, start_time timestamptz, end_time timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron
AS $$
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT d.jobid, j.jobname, d.status, d.return_message, d.start_time, d.end_time
      FROM cron.job_run_details d
      LEFT JOIN cron.job j ON j.jobid = d.jobid
     ORDER BY d.start_time DESC
     LIMIT _limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_cron_jobs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_cron_runs(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_runs(int) TO authenticated;

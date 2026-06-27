ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_only
  ON public.cron_runs
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

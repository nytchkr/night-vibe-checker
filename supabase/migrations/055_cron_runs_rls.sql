-- Keep cron telemetry server-only. Supabase service-role code bypasses RLS.
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

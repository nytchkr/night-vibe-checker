CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  ran_at timestamptz DEFAULT now(),
  duration_ms int,
  venues_updated int,
  error text
);

CREATE INDEX IF NOT EXISTS cron_runs_job_name_ran_at_idx
  ON cron_runs (job_name, ran_at DESC);

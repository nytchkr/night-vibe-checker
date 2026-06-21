CREATE TABLE IF NOT EXISTS public.push_venue_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS push_venue_alerts_user_id_idx
  ON public.push_venue_alerts(user_id);

CREATE INDEX IF NOT EXISTS push_venue_alerts_venue_id_idx
  ON public.push_venue_alerts(venue_id);

ALTER TABLE public.push_venue_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_venue_alerts'
      AND policyname = 'Users manage own alerts'
  ) THEN
    CREATE POLICY "Users manage own alerts"
      ON public.push_venue_alerts
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

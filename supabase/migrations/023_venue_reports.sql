CREATE TABLE IF NOT EXISTS public.venue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('wrong_hours','wrong_location','permanently_closed','duplicate','other')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.venue_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users submit reports" ON public.venue_reports;

CREATE POLICY "Auth users submit reports" ON public.venue_reports
  FOR INSERT WITH CHECK (true);

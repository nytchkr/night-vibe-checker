CREATE TABLE IF NOT EXISTS public.user_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points_total integer NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'newcomer',
  streak_count integer NOT NULL DEFAULT 0,
  last_checkin_at timestamptz,
  trusted_reporter boolean NOT NULL DEFAULT false,
  flagged_for_review boolean NOT NULL DEFAULT false,
  confirmed_checkins integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own score" ON public.user_scores;
CREATE POLICY "users can read own score"
  ON public.user_scores FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service role full access" ON public.user_scores;
CREATE POLICY "service role full access"
  ON public.user_scores
  USING (true)
  WITH CHECK (true);

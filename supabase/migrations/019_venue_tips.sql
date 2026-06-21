CREATE TABLE IF NOT EXISTS public.venue_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tip text NOT NULL CHECK (char_length(tip) BETWEEN 10 AND 200),
  helpful_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.venue_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads tips" ON public.venue_tips
  FOR SELECT USING (true);

CREATE POLICY "Auth users add tips" ON public.venue_tips
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_venue_tip_helpful(tip_id uuid)
RETURNS TABLE (
  id uuid,
  venue_id text,
  user_id uuid,
  tip text,
  helpful_count int,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.venue_tips
  SET helpful_count = venue_tips.helpful_count + 1
  WHERE venue_tips.id = tip_id
  RETURNING
    venue_tips.id,
    venue_tips.venue_id,
    venue_tips.user_id,
    venue_tips.tip,
    venue_tips.helpful_count,
    venue_tips.created_at;
$$;

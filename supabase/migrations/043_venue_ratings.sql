CREATE TABLE IF NOT EXISTS public.venue_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

ALTER TABLE public.venue_ratings DROP CONSTRAINT IF EXISTS venue_ratings_rating_check;
ALTER TABLE public.venue_ratings DROP CONSTRAINT IF EXISTS venue_ratings_user_id_fkey;
ALTER TABLE public.venue_ratings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.venue_ratings
  ALTER COLUMN rating TYPE smallint
  USING (
    CASE
      WHEN rating::text = 'up' THEN 5
      WHEN rating::text = 'down' THEN 1
      WHEN rating::text ~ '^[1-5]$' THEN rating::text::smallint
      ELSE 3
    END
  );
ALTER TABLE public.venue_ratings
  ADD CONSTRAINT venue_ratings_rating_check CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE public.venue_ratings
  ADD CONSTRAINT venue_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.venue_ratings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'venue_ratings'
      AND policyname = 'Public read'
  ) THEN
    CREATE POLICY "Public read" ON public.venue_ratings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'venue_ratings'
      AND policyname = 'Auth insert'
  ) THEN
    CREATE POLICY "Auth insert" ON public.venue_ratings FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

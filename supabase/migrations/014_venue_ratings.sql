CREATE TABLE IF NOT EXISTS public.venue_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  rating text CHECK (rating IN ('up','down')) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

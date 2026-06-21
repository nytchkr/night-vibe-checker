CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.saved_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

ALTER TABLE public.saved_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_venues_select_own ON public.saved_venues
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY saved_venues_insert_own ON public.saved_venues
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_venues_delete_own ON public.saved_venues
  FOR DELETE USING (auth.uid() = user_id);

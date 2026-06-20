CREATE TABLE IF NOT EXISTS public.saved_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

ALTER TABLE public.saved_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_venues_owner ON public.saved_venues
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

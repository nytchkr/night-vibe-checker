ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS venues_hidden_idx
  ON public.venues(hidden)
  WHERE hidden = false;

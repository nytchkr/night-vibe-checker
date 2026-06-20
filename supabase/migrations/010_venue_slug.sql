ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS venues_slug_idx ON public.venues(slug);

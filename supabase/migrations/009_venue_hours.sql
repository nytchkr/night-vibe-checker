ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS open_now boolean;

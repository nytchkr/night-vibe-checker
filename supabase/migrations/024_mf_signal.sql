ALTER TABLE public.venue_signals
  ADD COLUMN IF NOT EXISTS mf_ratio double precision,
  ADD COLUMN IF NOT EXISTS confidence_0_1 double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_size integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crowd_busyness_source text;

ALTER TABLE public.venue_signals
  ALTER COLUMN mf_ratio TYPE double precision USING mf_ratio::double precision,
  ALTER COLUMN confidence_0_1 TYPE double precision USING confidence_0_1::double precision,
  ALTER COLUMN sample_size TYPE integer USING round(sample_size)::integer,
  ALTER COLUMN sample_size SET DEFAULT 0;

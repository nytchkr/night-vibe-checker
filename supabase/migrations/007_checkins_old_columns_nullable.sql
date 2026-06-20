-- Migration 007: make old required columns nullable — new API uses busyness/crowd_feel, not legacy crowd_level/vibe_score/venue_name
ALTER TABLE public.check_ins ALTER COLUMN venue_name DROP NOT NULL;
ALTER TABLE public.check_ins ALTER COLUMN crowd_level DROP NOT NULL;
ALTER TABLE public.check_ins ALTER COLUMN vibe_score DROP NOT NULL;

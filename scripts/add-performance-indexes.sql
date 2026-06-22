-- NV-PERF-API: idempotent database indexes for venue API read paths.
-- Apply with Supabase SQL editor or psql against the target project.

CREATE INDEX IF NOT EXISTS venues_lat_lng_idx
  ON public.venues(lat, lng);

CREATE INDEX IF NOT EXISTS venues_zone_hidden_name_idx
  ON public.venues(zone_id, hidden, name);

CREATE INDEX IF NOT EXISTS venues_zone_hidden_lat_lng_idx
  ON public.venues(zone_id, hidden, lat, lng);

CREATE INDEX IF NOT EXISTS venue_signals_venue_id_idx
  ON public.venue_signals(venue_id);

CREATE INDEX IF NOT EXISTS venue_signals_busyness_idx
  ON public.venue_signals(busyness_0_100 DESC)
  WHERE busyness_0_100 IS NOT NULL;

CREATE INDEX IF NOT EXISTS check_ins_created_at_idx
  ON public.check_ins(created_at DESC);

CREATE INDEX IF NOT EXISTS check_ins_venue_created_at_idx
  ON public.check_ins(venue_id, created_at DESC);

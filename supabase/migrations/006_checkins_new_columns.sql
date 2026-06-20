-- Migration 006: add busyness + place_id to check_ins for VibeCheck consumer reset
-- Idempotent — safe to re-run

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS busyness TEXT CHECK (busyness IN ('dead', 'moderate', 'packed')),
  ADD COLUMN IF NOT EXISTS place_id TEXT;

CREATE INDEX IF NOT EXISTS idx_check_ins_place_id ON public.check_ins(place_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_busyness ON public.check_ins(busyness);

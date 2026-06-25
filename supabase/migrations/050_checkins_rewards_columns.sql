ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS lat_reported double precision,
  ADD COLUMN IF NOT EXISTS lng_reported double precision,
  ADD COLUMN IF NOT EXISTS distance_from_venue_m double precision,
  ADD COLUMN IF NOT EXISTS agreement_bonus_applied boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS check_ins_user_venue_created_idx
  ON public.check_ins(user_id, venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS check_ins_agreement_pending_idx
  ON public.check_ins(created_at)
  WHERE agreement_bonus_applied = false;

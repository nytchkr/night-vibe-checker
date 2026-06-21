ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS reporter_gender text
  CHECK (reporter_gender IN ('male', 'female'));

CREATE INDEX IF NOT EXISTS idx_check_ins_reporter_gender
  ON public.check_ins(reporter_gender)
  WHERE reporter_gender IS NOT NULL;

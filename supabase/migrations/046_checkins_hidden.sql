ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS check_ins_hidden_idx
  ON public.check_ins(hidden)
  WHERE hidden = false;

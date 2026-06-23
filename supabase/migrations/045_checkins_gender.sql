ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_gender_check;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_gender_check
    CHECK (gender IN ('M', 'F', 'prefer_not'));

CREATE INDEX IF NOT EXISTS idx_check_ins_gender
  ON public.check_ins(gender)
  WHERE gender IN ('M', 'F');

CREATE OR REPLACE FUNCTION public.ensure_check_ins_gender_column()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.check_ins
    ADD COLUMN IF NOT EXISTS gender text;

  ALTER TABLE public.check_ins
    DROP CONSTRAINT IF EXISTS check_ins_gender_check;

  ALTER TABLE public.check_ins
    ADD CONSTRAINT check_ins_gender_check
      CHECK (gender IN ('M', 'F', 'prefer_not'));

  CREATE INDEX IF NOT EXISTS idx_check_ins_gender
    ON public.check_ins(gender)
    WHERE gender IN ('M', 'F');

  NOTIFY pgrst, 'reload schema';
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_check_ins_gender_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_check_ins_gender_column() TO service_role;

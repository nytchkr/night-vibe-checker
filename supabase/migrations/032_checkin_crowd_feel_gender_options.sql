ALTER TABLE public.check_ins
  ALTER COLUMN gender_self_report TYPE text USING gender_self_report::text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%gender_self_report%'
  LOOP
    EXECUTE format('ALTER TABLE public.check_ins DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%crowd_feel%'
  LOOP
    EXECUTE format('ALTER TABLE public.check_ins DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_gender_self_report_check
    CHECK (gender_self_report IN ('m', 'f', 'nb')),
  ADD CONSTRAINT check_ins_crowd_feel_check
    CHECK (crowd_feel IN ('chill', 'hyped', 'mixed', 'dead', 'packed', 'mostly_male', 'mostly_female', 'balanced'));

CREATE OR REPLACE FUNCTION public.ensure_check_ins_gender_self_report_column()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  constraint_name text;
BEGIN
  ALTER TABLE public.check_ins
    ADD COLUMN IF NOT EXISTS gender_self_report text;

  ALTER TABLE public.check_ins
    ALTER COLUMN gender_self_report TYPE text USING gender_self_report::text;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%gender_self_report%'
  LOOP
    EXECUTE format('ALTER TABLE public.check_ins DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  ALTER TABLE public.check_ins
    ADD CONSTRAINT check_ins_gender_self_report_check
      CHECK (gender_self_report IN ('m', 'f', 'nb'));

  CREATE INDEX IF NOT EXISTS idx_check_ins_gender_self_report
    ON public.check_ins(gender_self_report)
    WHERE gender_self_report IS NOT NULL;

  NOTIFY pgrst, 'reload schema';
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_check_ins_gender_self_report_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_check_ins_gender_self_report_column() TO service_role;

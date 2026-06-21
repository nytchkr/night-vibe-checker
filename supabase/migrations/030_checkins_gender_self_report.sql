ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS gender_self_report char(1)
  CHECK (gender_self_report IN ('m', 'f'));

CREATE INDEX IF NOT EXISTS idx_check_ins_gender_self_report
  ON public.check_ins(gender_self_report)
  WHERE gender_self_report IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_check_ins_gender_self_report_column()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.check_ins
    ADD COLUMN IF NOT EXISTS gender_self_report char(1)
    CHECK (gender_self_report IN ('m', 'f'));

  CREATE INDEX IF NOT EXISTS idx_check_ins_gender_self_report
    ON public.check_ins(gender_self_report)
    WHERE gender_self_report IS NOT NULL;

  NOTIFY pgrst, 'reload schema';
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_check_ins_gender_self_report_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_check_ins_gender_self_report_column() TO service_role;

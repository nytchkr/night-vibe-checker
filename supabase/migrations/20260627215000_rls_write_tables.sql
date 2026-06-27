-- RLS safety net for write tables used by server-side routes.
-- API routes use the Supabase service role intentionally, but client access
-- must only allow authenticated users to read/insert their own rows.

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can read check_ins" ON public.check_ins;
DROP POLICY IF EXISTS "anyone can insert check_ins" ON public.check_ins;
DROP POLICY IF EXISTS "users can select own check_ins" ON public.check_ins;
DROP POLICY IF EXISTS "users can insert own check_ins" ON public.check_ins;

CREATE POLICY "users can select own check_ins"
  ON public.check_ins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users can insert own check_ins"
  ON public.check_ins
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Public read" ON public.venue_ratings;
DROP POLICY IF EXISTS "Auth insert" ON public.venue_ratings;
DROP POLICY IF EXISTS "users can select own venue_ratings" ON public.venue_ratings;
DROP POLICY IF EXISTS "users can insert own venue_ratings" ON public.venue_ratings;

CREATE POLICY "users can select own venue_ratings"
  ON public.venue_ratings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users can insert own venue_ratings"
  ON public.venue_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

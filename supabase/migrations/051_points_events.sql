CREATE TABLE IF NOT EXISTS public.points_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_id uuid REFERENCES public.check_ins(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  points_delta integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.points_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own events" ON public.points_events;
CREATE POLICY "users can read own events"
  ON public.points_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service role full access" ON public.points_events;
CREATE POLICY "service role full access"
  ON public.points_events
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS points_events_user_created_idx
  ON public.points_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS points_events_checkin_event_idx
  ON public.points_events(checkin_id, event_type);

CREATE OR REPLACE FUNCTION public.reward_level_for_confirmed_checkins(p_confirmed_checkins integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_confirmed_checkins >= 50 THEN 'insider'
    WHEN p_confirmed_checkins >= 20 THEN 'local'
    WHEN p_confirmed_checkins >= 5 THEN 'regular'
    ELSE 'newcomer'
  END
$$;

CREATE OR REPLACE FUNCTION public.apply_points_event(
  p_user_id uuid,
  p_delta integer,
  p_event_type text,
  p_reason text,
  p_checkin_id uuid DEFAULT NULL
)
RETURNS public.user_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_score public.user_scores;
BEGIN
  INSERT INTO public.user_scores(user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.points_events(user_id, checkin_id, event_type, points_delta, reason)
  VALUES (p_user_id, p_checkin_id, p_event_type, p_delta, p_reason);

  UPDATE public.user_scores
  SET
    points_total = points_total + p_delta,
    level = public.reward_level_for_confirmed_checkins(confirmed_checkins),
    trusted_reporter = confirmed_checkins >= 20,
    last_checkin_at = CASE WHEN p_event_type = 'checkin' THEN now() ELSE last_checkin_at END,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO updated_score;

  RETURN updated_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_confirmed_checkins_and_recompute(p_user_id uuid)
RETURNS public.user_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_score public.user_scores;
BEGIN
  INSERT INTO public.user_scores(user_id, confirmed_checkins)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET confirmed_checkins = public.user_scores.confirmed_checkins + 1;

  UPDATE public.user_scores
  SET
    level = public.reward_level_for_confirmed_checkins(confirmed_checkins),
    trusted_reporter = confirmed_checkins >= 20,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO updated_score;

  RETURN updated_score;
END;
$$;

REVOKE ALL ON FUNCTION public.reward_level_for_confirmed_checkins(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_points_event(uuid, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_confirmed_checkins_and_recompute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_level_for_confirmed_checkins(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_points_event(uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_confirmed_checkins_and_recompute(uuid) TO service_role;

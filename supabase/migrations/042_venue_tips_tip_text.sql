ALTER TABLE public.venue_tips
  ADD COLUMN IF NOT EXISTS tip_text text;

UPDATE public.venue_tips
SET tip_text = COALESCE(NULLIF(tip_text, ''), tip)
WHERE tip_text IS NULL OR tip_text = '';

ALTER TABLE public.venue_tips
  DROP CONSTRAINT IF EXISTS venue_tips_tip_check;

ALTER TABLE public.venue_tips
  ALTER COLUMN tip DROP NOT NULL,
  ALTER COLUMN tip_text SET NOT NULL,
  ADD CONSTRAINT venue_tips_tip_text_length CHECK (char_length(tip_text) <= 200);

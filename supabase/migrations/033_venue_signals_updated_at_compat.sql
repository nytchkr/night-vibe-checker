alter table public.venue_signals
  add column if not exists updated_at timestamptz;

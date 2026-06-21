-- Add direct venue-level cache fields for the protected BestTime cron.
alter table public.venues
  add column if not exists busyness_pct integer check (busyness_pct between 0 and 100);

alter table public.venues
  add column if not exists crowd_feel text check (crowd_feel in ('male', 'female', 'balanced'));

create index if not exists venues_busyness_pct_idx
  on public.venues(busyness_pct)
  where busyness_pct is not null;

-- NV-PLACES-ENRICH: cache richer Google Places Details data.
alter table public.venues add column if not exists price_level integer;
alter table public.venues alter column price_level type integer using price_level::integer;
alter table public.venues add column if not exists rating numeric(3,1);
alter table public.venues add column if not exists user_rating_count integer;
alter table public.venues add column if not exists website text;
alter table public.venues add column if not exists phone_number text;
alter table public.venues add column if not exists google_maps_uri text;
alter table public.venues add column if not exists current_popularity integer;
alter table public.venues add column if not exists current_popularity_updated_at timestamptz;
alter table public.venues add column if not exists editorial_summary text;
alter table public.venues add column if not exists opening_hours jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'venues_price_level_range'
  ) then
    alter table public.venues
      add constraint venues_price_level_range
      check (price_level is null or price_level between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'venues_rating_range'
  ) then
    alter table public.venues
      add constraint venues_rating_range
      check (rating is null or rating between 1.0 and 5.0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'venues_current_popularity_range'
  ) then
    alter table public.venues
      add constraint venues_current_popularity_range
      check (current_popularity is null or current_popularity between 0 and 100);
  end if;
end $$;

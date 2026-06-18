-- ============================================================
-- Night Vibe Checker — Supabase SQL Schema
-- Run in Supabase SQL editor or via `supabase db push`
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: venues
-- Mirrors a subset of Google Places data + our metadata
-- ============================================================
create table if not exists public.venues (
  id              uuid primary key default uuid_generate_v4(),
  place_id        text not null unique,          -- Google Places ID
  name            text not null,
  address         text not null,
  lat             double precision not null,
  lng             double precision not null,
  venue_type      text,                          -- "bar" | "night_club" etc.
  google_rating   numeric(2,1),                  -- 1.0–5.0
  total_ratings   integer,
  price_level     smallint check (price_level between 1 and 4),
  photo_reference text,                          -- Google photo ref (not URL)
  website         text,
  phone_number    text,
  -- Cached aggregate of all vibe reports for this venue
  avg_vibe_score  numeric(3,1),
  report_count    integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists venues_place_id_idx on public.venues(place_id);
-- PostGIS-free geo lookup using bounding box math
create index if not exists venues_lat_lng_idx on public.venues(lat, lng);

-- ============================================================
-- TABLE: vibe_reports
-- One AI-generated report per venue (or per photo upload)
-- ============================================================
create table if not exists public.vibe_reports (
  id              uuid primary key default uuid_generate_v4(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  place_id        text not null,                 -- denormalized for fast lookup
  vibe_score      numeric(3,1) not null check (vibe_score between 0 and 10),
  energy_level    text not null check (energy_level in ('Low','Medium','High','Intense')),
  vibe_tags       text[] not null default '{}',
  music_vibe      text not null,
  crowd_type      text not null,
  best_for        text[] not null default '{}',
  summary         text not null,
  confidence      numeric(3,2) not null check (confidence between 0 and 1),
  from_photo      boolean not null default false,
  -- Store raw AI JSON for debugging / reprocessing
  raw_ai_response jsonb,
  generated_at    timestamptz not null default now(),
  -- Link to the user who triggered the check (nullable = anonymous)
  generated_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists vibe_reports_venue_id_idx on public.vibe_reports(venue_id);
create index if not exists vibe_reports_place_id_idx on public.vibe_reports(place_id);
create index if not exists vibe_reports_generated_at_idx on public.vibe_reports(generated_at desc);

-- ============================================================
-- TABLE: saved_spots
-- Users bookmark venues with a snapshot of the vibe score
-- ============================================================
create table if not exists public.saved_spots (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  venue_id            uuid not null references public.venues(id) on delete cascade,
  vibe_score_snapshot numeric(3,1),
  tags_snapshot       text[] not null default '{}',
  saved_at            timestamptz not null default now(),
  -- Prevent duplicate saves
  unique (user_id, venue_id)
);

create index if not exists saved_spots_user_id_idx on public.saved_spots(user_id);

-- ============================================================
-- TABLE: checkins
-- Users can log that they visited a venue
-- ============================================================
create table if not exists public.checkins (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  venue_id        uuid not null references public.venues(id) on delete cascade,
  vibe_report_id  uuid references public.vibe_reports(id) on delete set null,
  note            text,
  checked_in_at   timestamptz not null default now()
);

create index if not exists checkins_user_id_idx on public.checkins(user_id);
create index if not exists checkins_venue_id_idx on public.checkins(venue_id);
create index if not exists checkins_checked_in_at_idx on public.checkins(checked_in_at desc);

-- ============================================================
-- TRIGGER: keep venues.avg_vibe_score + report_count fresh
-- ============================================================
create or replace function public.refresh_venue_vibe_aggregate()
returns trigger language plpgsql security definer as $$
begin
  update public.venues
  set
    avg_vibe_score = (
      select round(avg(vibe_score)::numeric, 1)
      from public.vibe_reports
      where venue_id = coalesce(new.venue_id, old.venue_id)
    ),
    report_count = (
      select count(*)
      from public.vibe_reports
      where venue_id = coalesce(new.venue_id, old.venue_id)
    ),
    updated_at = now()
  where id = coalesce(new.venue_id, old.venue_id);
  return coalesce(new, old);
end;
$$;

create or replace trigger trg_vibe_reports_aggregate
after insert or update or delete on public.vibe_reports
for each row execute function public.refresh_venue_vibe_aggregate();

-- ============================================================
-- TRIGGER: updated_at auto-maintenance for venues
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_venues_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- venues: anyone can read, only service_role can write
alter table public.venues enable row level security;

create policy "venues_public_read"
  on public.venues for select
  using (true);

create policy "venues_service_insert"
  on public.venues for insert
  with check (auth.role() = 'service_role');

create policy "venues_service_update"
  on public.venues for update
  using (auth.role() = 'service_role');

-- vibe_reports: public read, authenticated users or service role can insert
alter table public.vibe_reports enable row level security;

create policy "vibe_reports_public_read"
  on public.vibe_reports for select
  using (true);

create policy "vibe_reports_insert"
  on public.vibe_reports for insert
  with check (
    auth.role() = 'service_role'
    or auth.uid() is not null
  );

-- saved_spots: users only see/modify their own rows
alter table public.saved_spots enable row level security;

create policy "saved_spots_own_read"
  on public.saved_spots for select
  using (auth.uid() = user_id);

create policy "saved_spots_own_insert"
  on public.saved_spots for insert
  with check (auth.uid() = user_id);

create policy "saved_spots_own_delete"
  on public.saved_spots for delete
  using (auth.uid() = user_id);

-- checkins: users only see/modify their own rows
alter table public.checkins enable row level security;

create policy "checkins_own_read"
  on public.checkins for select
  using (auth.uid() = user_id);

create policy "checkins_own_insert"
  on public.checkins for insert
  with check (auth.uid() = user_id);

create policy "checkins_own_delete"
  on public.checkins for delete
  using (auth.uid() = user_id);

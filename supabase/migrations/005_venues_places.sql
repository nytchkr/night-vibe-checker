-- ============================================================
-- Migration 003 — venues table for Google Places discovery
--
-- Creates the zones + venues tables and venue_signals read model.
-- All statements are idempotent (safe to re-run on existing schema).
-- ============================================================

-- Extension for UUID generation (PG < 13 compat)
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: zones
-- One row per launch zone. Keyed by human-readable slug.
-- ============================================================
create table if not exists public.zones (
  id          text primary key,
  name        text not null,
  center_lat  double precision not null,
  center_lng  double precision not null,
  radius_m    integer not null,
  created_at  timestamptz not null default now()
);

-- Seed the South End Charlotte launch zone
insert into public.zones (id, name, center_lat, center_lng, radius_m)
values ('south-end-charlotte', 'South End', 35.2178, -80.8597, 1500)
on conflict (id) do update set
  name       = excluded.name,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  radius_m   = excluded.radius_m;

-- ============================================================
-- TABLE: venues
-- Mirrors Google Places data + VibeCheck metadata.
-- Deduplicated on place_id (Google Places ID).
-- ============================================================
create table if not exists public.venues (
  id              uuid primary key default gen_random_uuid(),
  place_id        text not null unique,
  name            text not null,
  address         text not null default '',
  lat             double precision not null default 0,
  lng             double precision not null default 0,
  venue_type      text,
  category        text,
  zone_id         text references public.zones(id),
  google_rating   numeric(2,1),
  total_ratings   integer,
  price_level     smallint check (price_level between 1 and 4),
  photo_reference text,
  photo_url       text,
  hidden          boolean not null default false,
  besttime_venue_id text,
  last_busyness_refresh timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Add columns that may be missing on older installs
alter table public.venues add column if not exists photo_url text;
alter table public.venues add column if not exists category text;
alter table public.venues add column if not exists zone_id text references public.zones(id);
alter table public.venues add column if not exists hidden boolean not null default false;
alter table public.venues add column if not exists besttime_venue_id text;
alter table public.venues add column if not exists last_busyness_refresh timestamptz;
alter table public.venues add column if not exists updated_at timestamptz not null default now();

-- Indexes
create index if not exists venues_place_id_idx on public.venues(place_id);
create index if not exists venues_zone_id_idx  on public.venues(zone_id);
create index if not exists venues_lat_lng_idx  on public.venues(lat, lng);

-- ============================================================
-- TABLE: venue_signals
-- Cached consumer read model written by background jobs only.
-- ============================================================
create table if not exists public.venue_signals (
  venue_id              uuid primary key references public.venues(id) on delete cascade,
  place_id              text not null unique,
  busyness_0_100        integer check (busyness_0_100 between 0 and 100),
  busyness_source       text check (busyness_source in ('live','forecast','crowd')),
  mf_ratio              integer check (mf_ratio between 0 and 100),
  confidence_0_1        numeric(5,4) not null default 0 check (confidence_0_1 between 0 and 1),
  sample_size           numeric(8,2) not null default 0,
  computed_at           timestamptz not null default now(),
  last_busyness_refresh timestamptz
);

create index if not exists venue_signals_place_id_idx on public.venue_signals(place_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- zones: public read, service_role write
alter table public.zones enable row level security;

drop policy if exists "zones_public_read" on public.zones;
create policy "zones_public_read"
  on public.zones for select using (true);

-- venues: public read, service_role write
alter table public.venues enable row level security;

drop policy if exists "venues_public_read"   on public.venues;
drop policy if exists "venues_service_insert" on public.venues;
drop policy if exists "venues_service_update" on public.venues;

create policy "venues_public_read"
  on public.venues for select using (true);

create policy "venues_service_insert"
  on public.venues for insert
  with check (auth.role() = 'service_role');

create policy "venues_service_update"
  on public.venues for update
  using (auth.role() = 'service_role');

-- venue_signals: public read, service_role write
alter table public.venue_signals enable row level security;

drop policy if exists "venue_signals_public_read"  on public.venue_signals;
drop policy if exists "venue_signals_service_write" on public.venue_signals;

create policy "venue_signals_public_read"
  on public.venue_signals for select using (true);

create policy "venue_signals_service_write"
  on public.venue_signals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- TRIGGER: auto-maintain venues.updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_venues_updated_at on public.venues;
create trigger trg_venues_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

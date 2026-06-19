-- ============================================================
-- Migration 004 — venues + venue_signals catchup (idempotent)
--
-- This migration is safe to re-run. All statements use
-- IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / OR REPLACE so they
-- are no-ops when the schema is already up to date.
--
-- Context:
--   003_venues_places.sql created zones, venues, and venue_signals.
--   003_checkins_vibecheck_columns.sql (unnumbered) added
--     check_ins.crowd_feel and check_ins.hidden.
--   This file (004) ensures every column the application expects
--   is present, fills any gaps between installs, and locks in the
--   RLS policy set required by the QA journey matrix (NV-077):
--     • public read for zones, venues, venue_signals
--     • authenticated insert for check_ins (registered users only)
--     • service_role bypass for background jobs (admin path)
-- ============================================================

-- ============================================================
-- EXTENSION (idempotent)
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: zones
-- ============================================================
create table if not exists public.zones (
  id         text primary key,
  name       text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m   integer not null,
  created_at timestamptz not null default now()
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
-- ============================================================
create table if not exists public.venues (
  id              uuid primary key default uuid_generate_v4(),
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
  besttime_venue_id       text,
  last_busyness_refresh   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Additive column guards: ensure all app-expected columns exist
-- regardless of which prior migration ran first.
alter table public.venues add column if not exists photo_url text;
alter table public.venues add column if not exists category text;
alter table public.venues add column if not exists zone_id text references public.zones(id);
alter table public.venues add column if not exists hidden boolean not null default false;
alter table public.venues add column if not exists besttime_venue_id text;
alter table public.venues add column if not exists last_busyness_refresh timestamptz;
alter table public.venues add column if not exists updated_at timestamptz not null default now();
-- "rating" is the canonical short name used in app types (VenueSignal, VenueCard).
-- google_rating is kept for backward compat; rating mirrors it for new queries.
alter table public.venues add column if not exists rating numeric(2,1);

-- Indexes
create index if not exists venues_place_id_idx on public.venues(place_id);
create index if not exists venues_zone_id_idx  on public.venues(zone_id);
create index if not exists venues_lat_lng_idx  on public.venues(lat, lng);
create index if not exists venues_hidden_idx   on public.venues(hidden) where hidden = false;

-- ============================================================
-- TABLE: venue_signals
-- Cached consumer read model. Written by service_role jobs only.
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
-- TABLE: check_ins — column guards
-- Core table created in 002_check_ins.sql.
-- crowd_feel and hidden may be missing on old installs.
-- ============================================================
alter table public.check_ins add column if not exists crowd_feel text
  check (crowd_feel in ('mostly_male', 'mostly_female', 'balanced', 'mixed'));

alter table public.check_ins add column if not exists hidden boolean not null default false;

create index if not exists check_ins_hidden_idx on public.check_ins(hidden) where hidden = false;

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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- zones: public read, service_role write
alter table public.zones enable row level security;

drop policy if exists "zones_public_read" on public.zones;
create policy "zones_public_read"
  on public.zones for select using (true);

-- venues: public read, service_role insert/update
alter table public.venues enable row level security;

drop policy if exists "venues_public_read"    on public.venues;
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

drop policy if exists "venue_signals_public_read"   on public.venue_signals;
drop policy if exists "venue_signals_service_write" on public.venue_signals;

create policy "venue_signals_public_read"
  on public.venue_signals for select using (true);

create policy "venue_signals_service_write"
  on public.venue_signals for all
  using    (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- check_ins: public read, AUTHENTICATED insert (not anonymous),
--            users delete own rows, service_role bypass for admin moderation
alter table public.check_ins enable row level security;

-- Keep the existing open-read policy
drop policy if exists "anyone can read check_ins" on public.check_ins;
create policy "anyone can read check_ins"
  on public.check_ins for select using (true);

-- Replace open insert with authenticated-only insert
drop policy if exists "anyone can insert check_ins"          on public.check_ins;
drop policy if exists "authenticated users can insert check_ins" on public.check_ins;
create policy "authenticated users can insert check_ins"
  on public.check_ins for insert
  with check (auth.role() = 'authenticated');

-- Users may delete their own rows
drop policy if exists "users can delete own check_ins" on public.check_ins;
create policy "users can delete own check_ins"
  on public.check_ins for delete
  using (auth.uid() = user_id);

-- Admin moderation: hide/unhide rows via service_role only
drop policy if exists "service_role can update check_ins" on public.check_ins;
create policy "service_role can update check_ins"
  on public.check_ins for update
  using    (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

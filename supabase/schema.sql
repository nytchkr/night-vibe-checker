-- ============================================================
-- Night Vibe Checker — Supabase SQL Schema
-- Run in Supabase SQL editor or via `supabase db push`
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: zones
-- Locked consumer-only launch zones
-- ============================================================
create table if not exists public.zones (
  id          text primary key,
  name        text not null,
  center_lat  double precision not null,
  center_lng  double precision not null,
  radius_m    integer not null,
  created_at  timestamptz not null default now()
);

insert into public.zones (id, name, center_lat, center_lng, radius_m)
values ('south-end-charlotte', 'South End, Charlotte', 35.2123, -80.8590, 1500)
on conflict (id) do update set
  name = excluded.name,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  radius_m = excluded.radius_m;

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
  photo_url       text,                          -- Google Place Photo URL only
  category        text,
  zone_id         text references public.zones(id),
  hidden          boolean not null default false,
  besttime_venue_id text,
  busyness_0_100  integer check (busyness_0_100 between 0 and 100),
  busyness_source text check (busyness_source in ('live','forecast','crowd')),
  last_busyness_refresh timestamptz,
  website         text,
  phone_number    text,
  -- Cached aggregate of all vibe reports for this venue
  avg_vibe_score  numeric(3,1),
  report_count    integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists venues_place_id_idx on public.venues(place_id);
create index if not exists venues_zone_id_idx on public.venues(zone_id);
-- PostGIS-free geo lookup using bounding box math
create index if not exists venues_lat_lng_idx on public.venues(lat, lng);

alter table public.venues add column if not exists photo_url text;
alter table public.venues add column if not exists category text;
alter table public.venues add column if not exists zone_id text references public.zones(id);
alter table public.venues add column if not exists hidden boolean not null default false;
alter table public.venues add column if not exists besttime_venue_id text;
alter table public.venues add column if not exists busyness_0_100 integer check (busyness_0_100 between 0 and 100);
alter table public.venues add column if not exists busyness_source text check (busyness_source in ('live','forecast','crowd'));
alter table public.venues add column if not exists last_busyness_refresh timestamptz;

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
-- TABLE: check_ins
-- Consumer live reports. Authenticated users only write.
-- ============================================================
create table if not exists public.check_ins (
  id            uuid primary key default uuid_generate_v4(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  place_id      text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  busyness      text not null check (busyness in ('dead','moderate','packed')),
  crowd_feel    text not null check (crowd_feel in ('mostly_male','mostly_female','balanced','mixed')),
  note          text check (char_length(note) <= 200),
  hidden        boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists check_ins_user_id_idx on public.check_ins(user_id);
create index if not exists check_ins_venue_id_idx on public.check_ins(venue_id);
create index if not exists check_ins_place_id_idx on public.check_ins(place_id);
create index if not exists check_ins_created_at_idx on public.check_ins(created_at desc);

-- Existing installs may have the old anonymous/vibe-score columns. The
-- guarded ALTER statements let Supabase migrate the shape in-place.
alter table public.check_ins add column if not exists place_id text;
alter table public.check_ins add column if not exists busyness text check (busyness in ('dead','moderate','packed'));
alter table public.check_ins add column if not exists crowd_feel text check (crowd_feel in ('mostly_male','mostly_female','balanced','mixed'));
alter table public.check_ins add column if not exists hidden boolean not null default false;
alter table public.check_ins drop column if exists venue_name;
alter table public.check_ins drop column if exists crowd_level;
alter table public.check_ins drop column if exists vibe_score;
alter table public.check_ins drop column if exists music_type;
alter table public.check_ins drop column if exists wait_minutes;
alter table public.check_ins drop column if exists tags;
alter table public.check_ins drop column if exists session_id;

-- ============================================================
-- TABLE: venue_signals
-- Cached consumer read model. Only jobs/signal engine write.
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

-- zones: anyone can read, only service_role can write
alter table public.zones enable row level security;

create policy "zones_public_read"
  on public.zones for select
  using (true);

-- check_ins: public read, authenticated users write their own rows
alter table public.check_ins enable row level security;

drop policy if exists "check_ins_public_read" on public.check_ins;
drop policy if exists "check_ins_public_insert" on public.check_ins;
drop policy if exists "check_ins_own_insert" on public.check_ins;
drop policy if exists "check_ins_service_insert" on public.check_ins;
drop policy if exists "check_ins_own_delete" on public.check_ins;

create policy "check_ins_public_read"
  on public.check_ins for select
  using (hidden = false);

create policy "check_ins_own_insert"
  on public.check_ins for insert
  with check (auth.uid() = user_id);

create policy "check_ins_service_insert"
  on public.check_ins for insert
  with check (auth.role() = 'service_role');

create policy "check_ins_own_delete"
  on public.check_ins for delete
  using (auth.uid() = user_id);

-- venue_signals: anyone can read, only service_role can write
alter table public.venue_signals enable row level security;

drop policy if exists "venue_signals_public_read" on public.venue_signals;
drop policy if exists "venue_signals_service_write" on public.venue_signals;

create policy "venue_signals_public_read"
  on public.venue_signals for select
  using (true);

create policy "venue_signals_service_write"
  on public.venue_signals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

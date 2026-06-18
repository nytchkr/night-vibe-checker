-- ============================================================
-- Migration 001 — saved_spots table (MVP-compatible)
--
-- Uses venue_id as Google Places place_id (text), not a UUID FK
-- to a venues table, since venues are not persisted in the DB at
-- this stage of the MVP.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.saved_spots (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- Google Places place_id — NOT a FK to a venues table
  venue_id            text not null,
  venue_name          text not null default '',
  vibe_score_snapshot numeric(3,1),
  tags_snapshot       text[] not null default '{}',
  saved_at            timestamptz not null default now(),
  -- One bookmark per user per venue
  unique (user_id, venue_id)
);

create index if not exists saved_spots_user_id_idx on public.saved_spots(user_id);

-- RLS: users can only see and modify their own rows
alter table public.saved_spots enable row level security;

create policy "saved_spots_own_select"
  on public.saved_spots for select
  using (auth.uid() = user_id);

create policy "saved_spots_own_insert"
  on public.saved_spots for insert
  with check (auth.uid() = user_id);

create policy "saved_spots_own_delete"
  on public.saved_spots for delete
  using (auth.uid() = user_id);

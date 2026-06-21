create extension if not exists pgcrypto;

create table if not exists public.saved_venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id text not null,
  saved_at timestamptz not null default now(),
  unique(user_id, venue_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_venues'
      and column_name = 'created_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_venues'
      and column_name = 'saved_at'
  ) then
    alter table public.saved_venues rename column created_at to saved_at;
  end if;
end $$;

alter table public.saved_venues
  add column if not exists saved_at timestamptz not null default now();

alter table public.saved_venues
  drop constraint if exists saved_venues_venue_id_fkey;

alter table public.saved_venues
  alter column venue_id type text using venue_id::text;

create unique index if not exists saved_venues_user_venue_idx
  on public.saved_venues(user_id, venue_id);

create index if not exists saved_venues_user_saved_at_idx
  on public.saved_venues(user_id, saved_at desc);

alter table public.saved_venues enable row level security;

drop policy if exists saved_venues_owner on public.saved_venues;
drop policy if exists saved_venues_select_own on public.saved_venues;
drop policy if exists saved_venues_insert_own on public.saved_venues;
drop policy if exists saved_venues_delete_own on public.saved_venues;

create policy saved_venues_select_own on public.saved_venues
  for select using (auth.uid() = user_id);

create policy saved_venues_insert_own on public.saved_venues
  for insert with check (auth.uid() = user_id);

create policy saved_venues_delete_own on public.saved_venues
  for delete using (auth.uid() = user_id);

create extension if not exists pgcrypto;

create table if not exists public.saved_venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id text not null,
  created_at timestamptz not null default now(),
  unique(user_id, venue_id)
);

alter table public.saved_venues
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_venues'
      and column_name = 'saved_at'
  ) then
    update public.saved_venues
      set created_at = saved_at
      where saved_at is not null
        and created_at is distinct from saved_at;
  end if;
end $$;

alter table public.saved_venues
  drop constraint if exists saved_venues_venue_id_fkey;

alter table public.saved_venues
  alter column venue_id type text using venue_id::text;

create unique index if not exists saved_venues_user_venue_idx
  on public.saved_venues(user_id, venue_id);

create index if not exists saved_venues_user_created_at_idx
  on public.saved_venues(user_id, created_at desc);

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

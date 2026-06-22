create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table public.push_subscriptions
  add column if not exists endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth text,
  add column if not exists created_at timestamptz default now();

create unique index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions(endpoint);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage own push subs" on public.push_subscriptions;
create policy "Users manage own push subs"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.saved_venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  venue_id text not null,
  alert_threshold integer default 70,
  created_at timestamptz default now(),
  unique(user_id, venue_id)
);

alter table public.saved_venues
  add column if not exists alert_threshold integer default 70,
  add column if not exists created_at timestamptz default now();

alter table public.saved_venues
  drop constraint if exists saved_venues_alert_threshold_check;

alter table public.saved_venues
  add constraint saved_venues_alert_threshold_check
  check (alert_threshold between 0 and 100);

create unique index if not exists saved_venues_user_venue_idx
  on public.saved_venues(user_id, venue_id);

create index if not exists saved_venues_user_created_at_idx
  on public.saved_venues(user_id, created_at desc);

alter table public.saved_venues enable row level security;

drop policy if exists "Users manage own saved venues" on public.saved_venues;
create policy "Users manage own saved venues"
  on public.saved_venues
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

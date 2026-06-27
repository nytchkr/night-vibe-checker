create extension if not exists pgcrypto;

create table if not exists public.notifications_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  venue_id text not null,
  notification_type text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists notifications_sent_recent_idx
  on public.notifications_sent(user_id, venue_id, notification_type, sent_at desc);

create index if not exists notifications_sent_sent_at_idx
  on public.notifications_sent(sent_at desc);

alter table public.notifications_sent enable row level security;

drop policy if exists "Service role manages sent notifications" on public.notifications_sent;
create policy "Service role manages sent notifications"
  on public.notifications_sent
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

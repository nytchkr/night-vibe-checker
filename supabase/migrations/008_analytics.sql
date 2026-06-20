-- ============================================================
-- Migration 008 — lightweight analytics events
-- ============================================================

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  venue_id uuid references public.venues(id) on delete set null,
  user_id uuid,
  ip_hash text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_idx on public.analytics_events(event);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at);

alter table public.analytics_events enable row level security;

drop policy if exists analytics_service_write on public.analytics_events;
create policy analytics_service_write
  on public.analytics_events for insert
  with check (true);

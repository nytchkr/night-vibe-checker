-- check_ins: stores crowd/vibe reports for venues
create table if not exists public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  venue_id      text not null,
  venue_name    text not null,
  crowd_level   text not null check (crowd_level in ('quiet','moderate','packed','wild')),
  vibe_score    numeric(3,1) not null check (vibe_score >= 1.0 and vibe_score <= 10.0),
  music_type    text check (music_type in ('house','hiphop','rnb','techno','live','mixed','none')),
  wait_minutes  integer check (wait_minutes >= 0),
  tags          text[] default '{}',
  note          text check (char_length(note) <= 200),
  user_id       uuid references auth.users(id) on delete set null,
  session_id    text,
  created_at    timestamptz not null default now()
);

-- RLS
alter table public.check_ins enable row level security;

create policy "anyone can read check_ins"
  on public.check_ins for select using (true);

create policy "anyone can insert check_ins"
  on public.check_ins for insert with check (true);

create policy "users can delete own check_ins"
  on public.check_ins for delete using (auth.uid() = user_id);

-- Indexes for common queries
create index if not exists check_ins_venue_id_idx on public.check_ins (venue_id, created_at desc);
create index if not exists check_ins_user_id_idx on public.check_ins (user_id, created_at desc);

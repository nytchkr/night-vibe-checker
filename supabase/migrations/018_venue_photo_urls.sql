alter table public.venues
  add column if not exists photo_urls text[] default '{}';

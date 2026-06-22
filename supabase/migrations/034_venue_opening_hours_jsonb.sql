-- NV-OPEN-HOURS: cache Google Places regularOpeningHours payloads.
alter table public.venues add column if not exists opening_hours jsonb;


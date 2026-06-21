-- Add coarse launch-neighborhood labels for venue filtering.
-- The current schema stores venue coordinates as lat/lng columns rather than
-- a PostGIS location geometry, so these boxes use numeric bounds directly.

alter table public.venues add column if not exists neighborhood text;

update public.venues
set neighborhood = 'South End'
where lng between -80.870 and -80.845
  and lat between 35.210 and 35.230;

update public.venues
set neighborhood = 'NoDa'
where lng between -80.830 and -80.808
  and lat between 35.225 and 35.245;

update public.venues
set neighborhood = 'Uptown'
where lng between -80.855 and -80.835
  and lat between 35.222 and 35.240;

update public.venues
set neighborhood = 'South End'
where neighborhood is null;

create index if not exists venues_neighborhood_idx on public.venues(neighborhood);

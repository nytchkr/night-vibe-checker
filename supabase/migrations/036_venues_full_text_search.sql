-- NV-SEARCH-001: full-text search over venue name, category, and editorial summary.
alter table public.venues add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(editorial_summary, '')), 'C')
  ) stored;

create index if not exists venues_search_idx on public.venues using gin(search_vector);

create or replace function public.search_venue_ids(
  search_query text,
  search_zone_id text default null,
  search_category text default null,
  center_lat double precision default null,
  center_lng double precision default null,
  radius_m double precision default null,
  max_results integer default 100
)
returns table(id uuid, search_rank real)
language sql
stable
security definer
set search_path = public
as $$
  with query as (
    select plainto_tsquery('english', coalesce(search_query, '')) as tsq
  )
  select
    venues.id,
    ts_rank(venues.search_vector, query.tsq) as search_rank
  from public.venues, query
  where query.tsq <> ''::tsquery
    and venues.search_vector @@ query.tsq
    and venues.hidden is false
    and (search_zone_id is null or venues.zone_id = search_zone_id)
    and (
      search_category is null
      or venues.category ilike search_category
      or venues.venue_type ilike search_category
    )
    and (
      center_lat is null
      or center_lng is null
      or radius_m is null
      or (
        6371000 * 2 * asin(
          sqrt(
            power(sin(radians((venues.lat - center_lat) / 2)), 2) +
            cos(radians(center_lat)) *
            cos(radians(venues.lat)) *
            power(sin(radians((venues.lng - center_lng) / 2)), 2)
          )
        )
      ) <= radius_m
    )
  order by search_rank desc, venues.name asc
  limit greatest(1, least(coalesce(max_results, 100), 100));
$$;

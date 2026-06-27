-- Include address in public venue search.
drop index if exists public.venues_search_idx;

alter table public.venues drop column if exists search_vector;

alter table public.venues add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(neighborhood, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(address, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(editorial_summary, '')), 'C')
  ) stored;

create index if not exists venues_search_idx on public.venues using gin(search_vector);

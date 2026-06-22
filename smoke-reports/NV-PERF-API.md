# NV-PERF-API

Date: 2026-06-22

## Audit Findings

- `/api/venues` does not fetch venue signals in a per-venue loop. It uses a single Supabase embedded select for `venue_signals`, so no N+1 rewrite was required.
- `/api/venues/[id]` already loads the venue and embedded `venue_signals` in one DB query. The only second query path is the existing legacy fallback for older schemas missing optional contact/photo columns.
- `/api/venues`, `/api/venues/discover`, and `/api/venues/trending` had uncapped venue reads. They now use `.limit(100)`.
- `/api/venues` used a 60-second public cache TTL. It now uses `Cache-Control: public, s-maxage=30, stale-while-revalidate=300`.
- `/api/venues/[id]` returned rate-limit headers but no public cache header on success. It now uses `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- `/api/venues/trending` does not query `check_ins` directly; it ranks cached `venue_signals`. The supporting SQL still includes `check_ins(created_at DESC)` and `check_ins(venue_id, created_at DESC)` because check-in aggregation and profile/activity routes depend on recent check-in reads.

## Index Review

- `supabase/schema.sql` already defines `venues_lat_lng_idx` and `check_ins_created_at_idx`.
- `venue_signals.venue_id` is the primary key in `supabase/schema.sql`, so it is already indexed by Postgres.
- Added `scripts/add-performance-indexes.sql` as an idempotent application script for production/dev parity. It includes the existing critical indexes plus route-specific supporting indexes for `(zone_id, hidden, name)`, `(zone_id, hidden, lat, lng)`, `venue_signals(busyness_0_100 DESC)`, and `check_ins(venue_id, created_at DESC)`.

## Apply Instructions

No database keys are written here. Apply indexes manually with a privileged Supabase SQL session:

```sql
\i scripts/add-performance-indexes.sql
```

Or paste the contents of `scripts/add-performance-indexes.sql` into the Supabase SQL editor for each environment.

## Verification

- `npx tsc --noEmit` PASS
- `npm test -- --run src/app/api/__tests__/venues-trending.test.ts` PASS (1 file, 3 tests)
- `npm test -- --run` PASS (31 files, 126 tests)

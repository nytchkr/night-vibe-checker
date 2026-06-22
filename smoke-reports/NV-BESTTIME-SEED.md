# NV-BESTTIME-SEED Report

Generated: 2026-06-22T04:15:48Z

## Summary

- Target DB: production Supabase from `.env.local`.
- Seed query: visible venues where `besttime_venue_id IS NULL`.
- Seed result: 42 venues scanned, 1 venue updated, 41 venue-level BestTime no-forecast failures.
- BestTime API behavior: the endpoint rejected JSON/form POST bodies and rejected `api_key`; it accepted the existing project contract, `POST /api/v1/forecasts?api_key_private=...&venue_name=...&venue_address=...`.
- Production refresh job: `POST https://night-vibe-checker.vercel.app/api/jobs/refresh-busyness?limit=100` returned HTTP 200 with 100 results, 73 ok, 27 failed, and `openNow.updated=124`.

## Verification

- Visible venues: 124.
- Visible venues still missing `besttime_venue_id`: 42.
- `venue_signals` rows: 124.
- `venue_signals` rows with non-null `busyness_0_100`: 82.
- Recent non-null samples included forecast scores `0`, `0`, `10`, `0`, `0` with `last_busyness_refresh` timestamps around `2026-06-22T04:15Z`.

## Commands

```bash
npm run type-check
npm test -- --run src/lib/__tests__/besttime.test.ts src/app/api/__tests__/refresh-busyness-cron.test.ts
npx tsx scripts/seed-besttime-ids.ts
POST https://night-vibe-checker.vercel.app/api/jobs/refresh-busyness?limit=100
```

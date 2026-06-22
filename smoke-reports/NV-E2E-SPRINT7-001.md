# NV-E2E-SPRINT7-001 Regression Smoke Report

Date: 2026-06-22
Agent: dev-tech-agent
Base URL: https://night-vibe-checker.vercel.app

## Summary

Sprint 2-6 regression smoke completed against production. One production failure was found:
`GET /api/venues/{id}/prediction` returned `403 {"error":"pro_required"}` instead of a real prediction payload. The local code has been fixed so the prediction endpoint is a public read endpoint and returns BestTime/Google-derived data without `isStub`.

No deployment was performed. Claude owns deploy.

## Local Verification

- `npx tsc --noEmit`: PASS
- `npm test -- --run src/app/api/__tests__/venue-prediction.test.ts`: PASS, 1 file / 3 tests
- `npm test -- --run`: PASS, 36 files / 144 tests

## Source Checks

- `src/components/PWAInstallBanner.tsx`: exists
- `/explore` empty state exists in `src/app/explore/ExplorePageClient.tsx`:
  - no data: `No venues in this area yet. Check back soon.`
  - no search match: `No venues found for "<query>"`
  - no filter match: `No spots match this filter.`

## Production Probe Venue

- Venue ID: `f39cc7f9-69bd-4272-a4a3-d3c6cbc835cd`
- Venue name: `Dilworth Neighborhood Grille`
- Source: `GET /api/venues`
- Result: HTTP 200

## Production Endpoint Matrix

| Check | Method/Path | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| NV-AI-PREDICTION | `GET /api/venues/f39cc7f9-69bd-4272-a4a3-d3c6cbc835cd/prediction` | 200 real prediction, no `isStub:true` | 403 `{"error":"pro_required"}` | FAIL in prod; fixed locally, pending deploy |
| NV-SHARE-CARD | `GET /api/venues/f39cc7f9-69bd-4272-a4a3-d3c6cbc835cd/share-card` | 200 `{ shareUrl, text }` | 200 `{ "shareUrl": "...?ref=share", "text": "Dilworth Neighborhood Grille is Moderate right now on NightVibe" }` | PASS |
| NV-WAITLIST | `POST /api/waitlist` valid email | 200 | 200 `{ "success": true }` | PASS |
| NV-VENUE-PHOTOS | `GET /api/venues/f39cc7f9-69bd-4272-a4a3-d3c6cbc835cd/photos` | 200 `{ photos: [] }` at minimum | 200 `{ "photos": ["/api/venues/.../photos?name=places%2F..."] }` | PASS |
| NV-CRON-HEALTH | `GET /api/health/cron` without auth | 401 | 401 `{ "error": "Unauthorized" }` | PASS |
| NV-SEC | `GET /api/saved-venues` without auth | 401 | 401 `UNAUTHORIZED` | PASS |
| NV-SEC | `GET /api/check-ins/me` without auth | 401 | 401 `UNAUTHORIZED` | PASS |
| NV-SEC | `GET /api/profile/gender` without auth | 401 | 401 `{ "error": "Unauthorized" }` | PASS |
| NV-SEC informational | `GET /api/subscription/status` without auth | public/free status allowed | 200 `{ "plan": "free", "status": "inactive" }` | PASS |

## Fix Applied

- `src/app/api/venues/[id]/prediction/route.ts`
  - Removed the authenticated Pro subscription gate from `GET`.
  - The endpoint now validates the venue ID and returns the existing BestTime forecast or Google venue-facts fallback for public reads.
- `src/app/api/__tests__/venue-prediction.test.ts`
  - Removed obsolete subscription mocks so tests match the public endpoint contract.

## Security Notes

Curl/fetch output was reviewed before writing this report. No `key=`, `token=`, or `password=` values are included here.

# NV-SMOKE-POST-ENRICH Production Smoke Report

Ticket: NV-SMOKE-POST
Dispatch: NV-SMOKE-POST-ENRICH-001
Environment: production
Base URL: https://night-vibe-checker.vercel.app
Checked at: 2026-06-22T04:25:11.609Z

## Result

PASS: production is serving the post-enrichment state expected after BestTime seeding and Google Places photo enrichment.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | GET `/` returns 200 | PASS | HTTP 200, HTML response |
| 2 | GET `/map` returns 200 | PASS | HTTP 200, HTML response |
| 3 | GET `/explore` returns 200 | PASS | HTTP 200, HTML response |
| 4 | GET `/profile` returns 200 | PASS | HTTP 200, HTML response |
| 5 | GET `/api/health` returns 200 with `status=ok`, `venue_count>=100`, `signals_count>=100` | PASS | HTTP 200; `status=ok`; `venue_count=124`; `signals_count=124` |
| 6 | GET `/venues/<real venue id>` returns 200, not 404 | PASS | `/venues/f39cc7f9-69bd-4272-a4a3-d3c6cbc835cd` returned HTTP 200 |
| 7 | `/api/venues` includes at least one venue with `photo_url` that is not Unsplash | PASS | `Dilworth Neighborhood Grille` has `photoUrl` from `maps.googleapis.com/maps/api/place/photo` |
| 8 | `/api/health` has `lastBusynessRefresh` within the last 25 hours | PASS | `lastBusynessRefresh=2026-06-22T04:15:23.605Z`; age at probe was about 0.16 hours |

## Additional Evidence

- `/api/venues` returned `status=success` with 123 visible launch-zone venues.
- Sample venue used for detail-route smoke:
  - id: `f39cc7f9-69bd-4272-a4a3-d3c6cbc835cd`
  - placeId: `ChIJr0fg_YWfVogR-pn_9djnJgI`
  - name: `Dilworth Neighborhood Grille`
  - signal source: `forecast`
  - venue signal `lastBusynessRefresh`: `2026-06-22T04:14:55.445+00:00`
- `/venue/ChIJr0fg_YWfVogR-pn_9djnJgI` also returned HTTP 200.

## Verification Command

Smoke probes were run with Node `fetch` against production from `/Users/admin/night-vibe-checker`.

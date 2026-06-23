# NV-E2E-SPRINT12-001 Regression Smoke Report

Date: 2026-06-23
Agent: dev-tech-agent
Base URL: https://night-vibe-checker.vercel.app

## Summary

Sprints 9-12 production API smoke completed against the live Vercel URL.

Result: 5 PASS, 3 FAIL.

The Sprint 7 production regression on `GET /api/venues/{id}/prediction` returning 403 is resolved in production: the endpoint now returns HTTP 200 with `source: "google_popularity_fallback"`. However, it still does not match the Sprint 12 requested response contract because there is no top-level `busyness_score`.

## Probe Venue

- First venue ID from `GET /api/venues`: `2060816d-9ca0-4244-89ef-18505da3b3c8`
- First venue name: `Taboo Lounge & Hookah Bar`
- `/api/venues` returned 100 venues.

## Endpoint Matrix

| Endpoint | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET /api/venues` | Array/list response; first item has `rating`, `opening_hours`, and `neighborhood` | HTTP 200; 100 venues; first item has `rating` and `openingHours`, but no `neighborhood` field | FAIL |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/prediction` | HTTP 200, not 403; `{ busyness_score, source }` | HTTP 200; `source: "google_popularity_fallback"`; no top-level `busyness_score`; nested `prediction.peakBusyness` is `null` | FAIL |
| `GET /api/venues/trending` | Array/list of trending venues | HTTP 200; 5 trending venues | PASS |
| `GET /api/stats/tonight` | `{ count: number }` | HTTP 200; `{ checkInsTonight: 1, venuesActive: 1 }`; no top-level `count` | FAIL |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/share-card` | `{ shareUrl, text }` | HTTP 200; both `shareUrl` and `text` present; text: `Taboo Lounge & Hookah Bar is Packed right now on NightVibe` | PASS |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/photos` | Array or empty array; not 500 | HTTP 200; `photos` array with 5 proxy URLs | PASS |
| `GET /api/health/cron` with admin password header | JSON response | HTTP 200; JSON `jobs` array returned. `refresh-busyness` is `ok`; `refresh-open-now`, `refresh-signals`, and `send-alerts` are `missing` | PASS |
| `POST /api/check-ins` without auth | HTTP 401 | HTTP 401 `{ "error": "Unauthorized" }` | PASS |

## Regressions vs Sprint 7

- Fixed since Sprint 7: `GET /api/venues/{id}/prediction` no longer returns 403 in production.
- New/requested-contract issue: prediction response still does not provide the requested top-level `busyness_score`.
- New/requested-contract issue: the first venue returned by `/api/venues` does not include `neighborhood`, even though later venues do.
- New/requested-contract issue: `/api/stats/tonight` returns `checkInsTonight` and `venuesActive`, not `{ count: number }`.

## Verification

- Production smoke probe: completed 2026-06-23 01:48 UTC.
- `npx tsc --noEmit`: PASS.

## Redaction

Raw API responses were reviewed before writing this report. Secret-bearing query values were omitted from this file.

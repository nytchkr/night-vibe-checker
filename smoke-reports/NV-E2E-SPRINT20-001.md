# NV-E2E-SPRINT20-001 Final MVP Regression Smoke

Date: 2026-06-23
Agent: dev-tech-agent
Base URL: https://night-vibe-checker.vercel.app

## Summary

Final E2E regression smoke for NightVibe Sprints 19-20 completed against the live Vercel production URL.

Result: 10 PASS, 0 FAIL.

This confirms the Sprint 17 production regressions are clear:
- `GET /api/venues/{id}` now returns `openNow` as a non-null boolean for the first venue.
- `GET /api/venues/{id}/tips` now returns HTTP 200 with an array response.

## Probe Venue

- First venue ID from `GET /api/venues`: `2060816d-9ca0-4244-89ef-18505da3b3c8`
- First venue name: `Taboo Lounge & Hookah Bar`
- `/api/venues` returned 100 venues.
- First venue `openNow`: `true`

## Endpoint Matrix

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET /api/venues` | 100 venues; first has `openNow` set correctly, not null | HTTP 200; 100 venues; first venue `openNow: true` | PASS |
| `GET /api/venues/trending` | 1-5 venues | HTTP 200; 5 venues | PASS |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8` | Venue detail with `openNow` not null | HTTP 200; `openNow: true` | PASS |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/tips` | HTTP 200 with array, not 500 | HTTP 200; array length 0 | PASS |
| `POST /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/check-in` without auth | HTTP 401 | HTTP 401; `UNAUTHORIZED` | PASS |
| `POST /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/rate` without auth | HTTP 401 | HTTP 401; `UNAUTHORIZED` | PASS |
| `GET /api/user/saved-venues` without auth | HTTP 401 | HTTP 401 | PASS |
| `GET /profile` | HTTP 200 | HTTP 200; `text/html` | PASS |
| `GET /venues/2060816d-9ca0-4244-89ef-18505da3b3c8` | HTTP 200, not 404 | HTTP 200; `text/html` | PASS |
| `GET /` | HTTP 200; home/map tab loads | HTTP 200; `text/html` | PASS |

## Verification

- Production smoke probe: PASS, completed 2026-06-23 03:13 UTC.
- `npx tsc --noEmit`: PASS.

## Redaction

Raw production responses were reviewed before writing this report. Secret-bearing URL/query/header values were omitted from this file, including `key`, `api_key`, `token`, and `secret` query values.

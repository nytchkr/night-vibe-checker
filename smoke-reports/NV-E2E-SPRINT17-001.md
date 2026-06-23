# NV-E2E-SPRINT17-001 Regression Smoke Report

Date: 2026-06-23
Agent: dev-tech-agent
Base URL: https://night-vibe-checker.vercel.app

## Summary

Sprints 13-17 production smoke completed against the live Vercel URL.

Result: 8 PASS, 2 FAIL.

Failures:
- `GET /api/venues/{id}` returns HTTP 200, but the first venue detail has `openNow: null`; expected `openNow` to be set correctly.
- `GET /api/venues/{id}/tips` returns HTTP 500; expected an array, which may be empty.

## Probe Venue

- First venue ID from `GET /api/venues`: `2060816d-9ca0-4244-89ef-18505da3b3c8`
- First venue name: `Taboo Lounge & Hookah Bar`
- `/api/venues` returned 100 venues.

## Endpoint Matrix

| Endpoint | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET /api/venues` | 100 venues; first has `rating`, `openingHours`, `neighborhood`, and `openNow` not null | HTTP 200; 100 venues; first has `rating: 3.9`, `openingHours` with 7 entries, `neighborhood: null`, `openNow: true` | PASS |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8` | Venue detail with `openNow` correctly set | HTTP 200; venue detail returned, but `openNow: null` | FAIL |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/tips` | Array response, may be empty | HTTP 500; `DB_ERROR`, `Could not fetch venue tips.` | FAIL |
| `GET /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/save` | `{ saved: boolean }`; 401 without auth is acceptable if noted | HTTP 401; unauthenticated response noted | PASS |
| `GET /api/venues/trending` | Array of trending venues | HTTP 200; 5 trending venues | PASS |
| `GET /api/health/cron` with admin password header | JSON `jobs` array | HTTP 200; `jobs` array with 4 entries | PASS |
| `POST /api/venues/2060816d-9ca0-4244-89ef-18505da3b3c8/rate` without auth | HTTP 401 | HTTP 401; login required | PASS |
| `GET /api/user/saved-venues` without auth | HTTP 401 | HTTP 401; authentication required | PASS |
| `GET /venues/2060816d-9ca0-4244-89ef-18505da3b3c8` with redirects followed | Page returns HTTP 200, not 404 | HTTP 200 | PASS |
| `GET /profile` | Page returns HTTP 200 | HTTP 200 | PASS |

## openNow Accuracy

The first venue's list response has `openNow: true`. At probe time, the venue's published Monday hours were `5:00 PM - 2:00 AM`, and the probe ran at 2026-06-23 02:39 UTC, which is 2026-06-22 22:39 in Charlotte. That makes the list value accurate.

The detail response for the same venue returned `openNow: null`, so detail `openNow` is not correctly set.

## Regressions vs Sprint 12

- Still present from Sprint 12: the first venue's `neighborhood` is `null` in the venue list response.
- New against the Sprint 17 requested contract: `GET /api/venues/{id}` detail returns `openNow: null` for the first venue while the list response computes `openNow: true`.
- New against the Sprint 17 requested contract: `GET /api/venues/{id}/tips` returns HTTP 500 instead of an array.
- No regression on overlapping Sprint 12 checks: `/api/venues` still returns 100 venues, `/api/venues/trending` returns HTTP 200 with an array, and `/api/health/cron` returns HTTP 200 with a JSON `jobs` array.

## Verification

- Production smoke probe: completed 2026-06-23 02:39 UTC.
- `npx tsc --noEmit`: PASS.

## Redaction

Raw production responses were reviewed before writing this report. Secret-bearing URL/query/header values were omitted from this file, including Google photo URLs that contain `key` parameters.

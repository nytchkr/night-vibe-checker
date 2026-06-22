# NV-REGRESSION-001

Date: 2026-06-22
Agent: dev-tech-agent
Scope: code-level regression audit for recent feature deploys

## Summary

| Feature | Status | Detail |
|---|---|---|
| Opening hours | PASS | Google `regularOpeningHours.periods[]` is parsed first, then category/time heuristic fallback is used. |
| BestTime reseed | PASS | Reseed script exists, uses env vars for secrets, venue APIs expose `besttime_venue_id`, and cron refresh reads cached BestTime IDs. |
| Delete account | PARTIAL | Endpoint verifies Bearer token, deletes user-owned rows, then deletes Supabase auth user, but its current success response shape disagrees with the targeted unit test. |
| Privacy toggles | PASS | Profile reads `user_metadata` and writes `push_enabled` / `private_checkins` through `supabase.auth.updateUser()`. |
| Enriched check-in cards | PASS | Profile and full history cards show busyness, crowd feel, and link to venue detail. |
| Refresh-signals route | FAIL | `dynamic` is inline, but the route still re-exports `GET` and `POST` from `refresh-busyness`. |
| Build health | PASS | `npx tsc --noEmit` passed. |
| API route smoke | PASS | Venues include signal data, health returns a stable health payload, and busyness cron requires `CRON_SECRET`. |

## 1. Opening Hours (8c9aa38)

Status: PASS

- `src/lib/openNow.ts` calls `isOpenNowFromGoogleHours(openingHours, charlotteTime)` before any category heuristic in `isOpenNow()`.
- `isOpenNowFromGoogleHours()` expects an object with `periods`, validates Google-style `open` and `close` endpoints with `day`, `hour`, and optional `minute`, maps them to weekly minutes, and handles overnight/week-wrap periods.
- Invalid or missing `opening_hours` returns `null`, which causes `isOpenNow()` to fall back to bar/restaurant/general heuristics instead of throwing.
- `refreshOpenNow()` reads venues with `.select("*")`, so `opening_hours` is currently included and passed into `isOpenNow()`.

Risk:

- The cron does not explicitly select `opening_hours`; it relies on `select("*")`. That works today but is fragile if the query is narrowed later.

## 2. BestTime Reseed (f87eb81)

Status: PASS

- `scripts/reseed-besttime.mjs` exists and reads `BESTTIME_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_URL` from environment variables. No literal API key values were found.
- The script redacts known secret values in logs and in `smoke-reports/NV-BESTTIME-RESEED.md`.
- `src/app/api/venues/route.ts` includes `besttime_venue_id` in the primary select and maps it to `ConsumerVenue.besttimeVenueId`.
- `src/lib/besttime.ts` selects `besttime_venue_id` in `refreshBusyness()` and `refreshBusynessForVenue()`. `refreshVenueRows()` uses the existing value first and only registers/re-registers when missing or stale.
- `src/app/api/cron/refresh-busyness/route.ts` requires cron auth, calls `refreshBusyness(50)`, then refreshes open-now state.

Risk:

- `fetchBestTimeDayRawForecast()` sends the configured key as `api_key_public`, but the same `apiKey()` helper reads `BESTTIME_API_KEY`. Confirm the env var is intentionally safe for that forecast endpoint if this route is exposed to consumers.

## 3. Delete Account (3793509)

Status: PARTIAL

- `src/app/api/account/delete/route.ts` exists and exports `POST`.
- It reads and validates a Bearer token with `supabaseAdmin.auth.getUser(token)`.
- It deletes from `check_ins` by `user_id`, deletes from `saved_venues` by `user_id`, then calls `supabaseAdmin.auth.admin.deleteUser(userId)`.
- It imports `supabaseAdmin`, whose admin client uses `SUPABASE_SERVICE_ROLE_KEY`; the delete route does not use a `NEXT_PUBLIC_` service credential.
- `src/app/profile/page.tsx` includes a Delete account row and a modal confirmation with Cancel and "Yes, delete" actions. The confirmed action calls `/api/account/delete` with `Authorization: Bearer <session.access_token>`.
- Targeted test mismatch: `src/app/api/__tests__/account-delete.test.ts` expects `{ success: true }`, while the current route returns `{ data: { success: true }, success: true }`.

Risk:

- Account deletion is not wrapped in a database transaction. If auth deletion fails after row deletion, user-owned app data may already be removed.
- The success response shape needs one owner decision: keep the newer `{ data: ... }` API envelope and update tests/clients, or restore the original response expected by the existing test.

## 4. Privacy Toggles (8a26ce1)

Status: PASS

- `src/app/profile/page.tsx` defines `push_enabled` and `private_checkins` preferences.
- Initial state is read from `session.user.user_metadata`.
- Toggling either setting calls `createBrowserClient().auth.updateUser({ data: nextPreferences })`, where `nextPreferences` contains both `push_enabled` and `private_checkins`.
- The local preference state is updated after Supabase succeeds and rolled back on failure.

Risk:

- The UI persists the privacy preference, but this audit did not find server-side filtering behavior tied to `private_checkins`. If product intent is to exclude private check-ins from public signal aggregation, that needs separate backend verification.

## 5. Enriched Check-In Cards (c9869c9)

Status: PASS

- `src/app/profile/page.tsx` recent check-in cards render a colored busyness pill for `dead`, `moderate`, or `packed`.
- `src/app/profile/page.tsx` renders crowd feel text for `balanced`, `mostly_male`, `mostly_female`, and `mixed`.
- Recent cards wrap valid `venueId` values in `Link href="/venues/<venueId>"`.
- `src/app/profile/check-ins/page.tsx` has the same busyness chip, crowd feel display, and venue-detail link behavior for full history.

Risk:

- Profile currently computes recent count from the first 20 returned rows in `fetchCheckIns()` when streak data is unavailable. That can undercount total history if the streak endpoint fails.

## 6. Refresh-Signals Route (da6892e)

Status: FAIL

- `src/app/api/cron/refresh-signals/route.ts` does include inline `export const dynamic = "force-dynamic";`.
- It still has `export { GET, POST } from "@/app/api/cron/refresh-busyness/route";`.
- This violates the regression requirement that `dynamic` must not be re-exported from another route file and that the route must not re-export dynamic behavior through another route module.

Required follow-up:

- Replace the route re-export with local `GET` and `POST` wrapper functions that call shared implementation logic without exporting route handlers from another route file.

## 7. Build Health

Status: PASS

Command:

```bash
npx tsc --noEmit
```

Result: PASS, exit code 0.

## 8. API Route Smoke

Status: PASS

- `src/app/api/venues/route.ts` returns `APIResponse<{ zone, venues }>` and includes `venue_signals` data mapped to `ConsumerVenue.signal`.
- `src/app/api/health/route.ts` returns a health payload with `status`, `ts`, `venue_count`, `signals_count`, `openNowCount`, `lastBusynessRefresh`, and `staleSince`, with `Cache-Control: no-store`.
- `src/app/api/cron/refresh-busyness/route.ts` requires `CRON_SECRET` via `Authorization: Bearer <secret>` or `x-cron-secret`; missing or incorrect auth returns 401.

## Verification

- `npx tsc --noEmit`: PASS.
- Targeted Vitest command:

```bash
npm test -- --run src/lib/__tests__/openNow.test.ts src/lib/__tests__/besttime.test.ts src/app/api/__tests__/account-delete.test.ts src/app/api/__tests__/health.test.ts src/app/api/__tests__/refresh-busyness-cron.test.ts src/app/api/__tests__/venues-trending.test.ts
```

Result: FAIL, 20 passing / 1 failing. Failure: `src/app/api/__tests__/account-delete.test.ts` expects `{ success: true }`, but the current route returns `{ data: { success: true }, success: true }`.

## Regression Risks

- `refresh-signals` route re-export remains the only direct FAIL in this audit.
- `refreshOpenNow()` relies on `select("*")` to include `opening_hours`; explicit selection would reduce accidental regressions.
- `private_checkins` is persisted in auth metadata, but public signal aggregation enforcement was not proven in this code audit.
- Account deletion can partially complete because data deletion and auth deletion are separate operations, and its current success response does not match the existing unit test contract.
- Several files in the working tree had pre-existing/concurrent modifications during this audit. This report intentionally does not claim ownership of those source changes.

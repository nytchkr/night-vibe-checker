# NV-ERROR-HANDLING

Date: 2026-06-22
Agent: dev-tech-agent

## Summary

Added and verified user-facing error boundaries for the global app, Explore, and venue detail surfaces. Hardened high-traffic venue API reads against thrown Supabase failures, removed raw database details from admin API responses, normalized validation failures from 422 to 400, and kept success responses carrying a `data` object while preserving legacy fields used by current UI/tests.

## Findings and changes

- `src/app/error.tsx` existed. Updated headline to the required friendly `Something went wrong.` copy and retained the `Try again` reset action on bg `#0A0A0E` with white text.
- `src/app/not-found.tsx` existed. Updated CTA copy to `Go back to map`.
- `src/app/venues/[id]/error.tsx` was missing. Added venue-level fallback with `Try again` and `Go back to map`.
- `src/app/explore/error.tsx` was missing. Added Explore-level fallback with `Try again` and `Go back to map`.
- Client fetch/Supabase review found most fetches already wrapped in `try/catch` with inline error or empty states. Added guards around unhandled Supabase auth/session calls in `BottomNav`, `OnboardingGate`, `SaveButton`, `login`, `ExplorePageClient`, `profile`, and `VenuePageClient`.
- `/api/check-ins` and `/api/venues/[id]/check-in` now validate check-in notes up to 500 chars. `/api/venues/[id]/check-in` also accepts numeric busyness 0-100 and normalizes it to the stored enum.
- Validation failures in API routes now return HTTP 400 instead of 422.
- Admin API responses no longer return raw DB `details` strings. Server logs still retain diagnostic context.
- `/api/venues` and `/api/venues/[id]` now catch unexpected data-layer failures and return sanitized 500 responses.
- Success responses touched in this ticket include `{ data: ... }` while retaining legacy compatibility fields such as `ok`, `success`, `venue`, `checkIns`, and `gender`.

## Compatibility note

The app already uses a shared legacy `APIResponse<T>` envelope with `status`, structured `error.code/message`, and `meta`. I preserved that shape for existing consumer routes and tests, while ensuring failures use sanitized messages and do not expose raw errors or stack traces. A full migration to top-level `{ error: string }` only would require coordinated client/test updates across the app.

## Verification

- `npx tsc --noEmit` passed.
- `npm test -- --run src/app/api/__tests__/check-ins.test.ts src/app/api/__tests__/venue-report.test.ts src/app/api/__tests__/venue-ratings.test.ts src/app/api/__tests__/push-subscribe.test.ts src/app/api/__tests__/notification-prefs.test.ts src/app/api/__tests__/venue-tips.test.ts src/app/api/__tests__/push-venue-alert.test.ts` passed: 7 files, 42 tests.

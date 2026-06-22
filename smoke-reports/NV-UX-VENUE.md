# NV-UX-AUDIT-VENUE

Date: 2026-06-22
Agent: ux-ui-agent

## Findings And Fixes

1. Hero photo
   - Finding: The page used cached Google photo URLs but had no graceful fallback if the image failed after render.
   - Fix: Kept Google photo URLs as the hero source and added an image error fallback to the venue initial.

2. Open/closed status
   - Finding: The compact status card treated missing `open_now` as closed and did not prefer today's hours.
   - Fix: Status now uses parsed `openingHours` first, showing today's open/close status when available. Missing hours show "Hours not available" instead of "Closed".

3. Busyness
   - Finding: Busyness percent rendered, but the main value did not include the user-readable level/color.
   - Fix: Main busyness now shows Quiet/Moderate/Packed with the same color thresholds as the meter.

4. M/F ratio
   - Finding: Existing ratio correctly requires at least 2 samples and otherwise shows an empty state.
   - Fix: Kept the honest empty state and verified no fabricated 50/50 value is shown.

5. Check-in/report-vibe button
   - Finding: Logged-out users saw a report button that opened the auth gate, which made the check-in action look available.
   - Fix: Logged-in users see the report button. Logged-out users see a sign-in link instead.

6. Save button
   - Finding: Save uses the current `SaveButton` hook and saved-state ARIA, but tests still expected a legacy login link.
   - Fix: Updated the targeted venue detail test to assert the visible tappable button and `aria-pressed` state.

7. Report venue issue
   - Finding: A venue issue report link exists, but the wording was generic.
   - Fix: Kept the issue report dialog scoped to venue corrections. Report-vibe remains the primary crowd action.

8. BestTime forecast
   - Finding: The venue page did not expose `besttime_venue_id` or show an hourly forecast section.
   - Fix: Exposed `besttimeVenueId`, added a server route for BestTime day raw forecast, and added a venue-page forecast section. Missing IDs and unavailable forecasts now show honest empty states.

9. 404
   - Finding: Missing venues already call `notFound()`.
   - Fix: Kept the custom dark 404 and removed the non-ASCII arrow from the map link.

10. Back navigation
   - Finding: Back button already used `router.back()` with `/map` fallback.
   - Fix: Verified the fallback route exists and left behavior intact.

11. Share
   - Finding: Share button already uses `navigator.share` with clipboard fallback.
   - Fix: Kept native share behavior intact.

## Verification

- PASS: `npx tsc --noEmit`
- PASS: `CI=1 BASE_URL=http://localhost:3107 npx playwright test e2e/venue-detail.spec.ts --project=chromium` (7 passed)
- PASS: `npm test -- --run src/lib/__tests__/besttime.test.ts` (2 passed)
- NOTE: `npm test -- --run` is currently red from unrelated in-progress API/test changes in the shared worktree (`venueLookup` mock compatibility and response envelope assertion updates outside this ticket).

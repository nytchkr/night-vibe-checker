# NV-UX-AUDIT-EXPLORE

Date: 2026-06-22
Agent: ux-ui-agent

## Findings and Fixes

1. Search by venue name works for partial matches. The empty state now distinguishes name-search misses from filter misses.
2. Category pills for Bar, Club, Restaurant, and Lounge retain active state and use the same category normalization as card display.
3. Busyness filtering now exposes the canonical Dead / Moderate / Packed buckets and filters against busyness levels instead of display labels.
4. Venue cards show venue name, normalized category, busyness chip, M/F ratio when supported, address, rating, and photo/fallback art.
5. Google Places photo URLs remain supported through Next image remote patterns. Card images now fall back to initials if a remote image errors.
6. Venue card tap navigates to `/venues/[id]`; verified by focused Explore Playwright coverage.
7. Cards now show an `Open now`, `Closed`, or `Hours unavailable` badge from `openNow` data.
8. Empty states are clearer for no venues, no name-search match, and no filtered results.
9. Loading skeletons now match the 126px venue-card row and 72px media slot to reduce loading shift.
10. Scroll remains virtualized with fixed row height and overscan; no new repaint-heavy scroll listeners were added.
11. Default sort remains `Busiest first`, with null crowd data sorted last.

## Verification

- PASS: `npx tsc --noEmit`
- PASS: `CI=1 BASE_URL=http://127.0.0.1:3107 npx playwright test e2e/explore.spec.ts --project=chromium --workers=1 --retries=0` — 12 passed.

No deployment was run.

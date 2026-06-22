# NV-UX-AUDIT-MAP Smoke Report

Date: 2026-06-22
Agent: ux-ui-agent
Scope: `/map`, `VenueMap`, `MapBottomSheet`, `VenueBottomSheet`

## Audit Findings

| Check | Result | Notes |
|---|---:|---|
| Loading state | PASS | Dynamic map shell and in-map venue fetch both show `MapLoadingSkeleton`; bottom sheet shows row skeletons. |
| Empty state | PASS | Empty venue set shows a contextual South End fallback card and bottom sheet empty copy. |
| Error state | PASS | API failure/timeout shows a retry panel and reload fallback; map render errors are caught by `MapErrorBoundary`. |
| Bottom sheet animation | PASS | Venue detail sheet uses requestAnimationFrame entry and transform/height transitions; no code-level flash/jank found. |
| Real open/closed status | FIXED | Detail sheet now shows `Open now`, `Closed now`, or `Hours pending` plus today's Google hours when available. Venue list rows now distinguish closed venues from pending hours. |
| Busyness chip colors | PASS | Dead/quiet uses gray, moderate uses yellow, packed uses red via `getBusynessState`/map color helpers. |
| Recenter control | FIXED | Recenter control is now explicitly labeled `Recenter to South End` and displays a South End pill. |
| Pin tap target | FIXED | Individual Leaflet venue pins now expose 44x44px hit targets while keeping the visual dot compact. |
| Cluster tap | PASS | Marker clusters keep 44x44px icons and `zoomToBoundsOnClick`; targeted E2E verifies cluster expansion. |
| Category filters | PASS | Existing category pills filter the visible venue list; targeted E2E covers Clubs filtering. |

## Verification

- `npx tsc --noEmit` - PASS
- `npm test -- --run src/lib/__tests__/openNow.test.ts src/lib/__tests__/venueShare.test.ts` - PASS, 10 tests
- `CI=1 npx playwright test e2e/map.spec.ts --project=chromium --reporter=list` - BLOCKED after initial map checks. The first 7 checks passed, including loading, category filters, cluster expansion, live pin pulse, and zip validation. The local Next dev server then showed an unrelated build error in `src/app/venues/[id]/VenuePageClient.tsx` (`Unexpected token` at line 1297), after which later tests failed with `ERR_CONNECTION_REFUSED`.

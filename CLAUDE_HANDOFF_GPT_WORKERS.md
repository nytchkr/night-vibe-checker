# VibeCheck Reset Handoff

Date: 2026-06-19
Repo: `/Users/admin/night-vibe-checker`

Canonical internal ticketing path: `/internal/tickets` (**Internal Tickets**). This is for Claude/Codex work coordination only and is not part of the consumer VibeCheck experience.

## Scope Completed

### Teardown

Commits:
- `76cbe8e` Remove legacy AI vibe analysis path
- `9196271` Remove legacy AI test fixtures
- `c0dd4b2` Remove OpenAI test setup stub

Removed:
- `src/app/api/vibe-check/route.ts`
- `src/app/api/__tests__/vibe-check.test.ts`
- `src/lib/ai.ts`
- `src/lib/__tests__/ai.test.ts`
- `src/lib/__tests__/fixtures.ts`
- `src/lib/demoVenues.ts`
- `src/components/VibeCheckInput.tsx`
- `src/components/VibeCheckProcessing.tsx`
- `src/components/VibeReport.tsx`
- OpenAI-only env/comment stubs in `src/test/setup.ts`

Notes:
- No owner/payment files matching `Owner`, `PromoManager`, `SubscribeDialog`, `ThankYou`, `create-checkout`, `wix-payments-webhook`, `Subscription`, `Promo`, `VenueClaim`, or the listed owner chart components were present in this repo.
- `/vibe-check` remains because it is currently the consumer check-in/report screen, not the deleted AI analysis API.

### Agent A: Google Places Launch-Zone Discovery

Commit:
- `761d9c7` Add Google Places launch zone discovery

Changed:
- `src/lib/launchZone.ts`
  - Adds locked v1 launch zone:
    - `id: south-end-charlotte`
    - `name: South End, Charlotte`
    - `center_lat: 35.2123`
    - `center_lng: -80.8590`
    - `radius_m: 1500`
- `src/lib/places.ts`
  - Replaces old query/search/details wrapper with `discoverZone(zone)`.
  - Uses Google Places Nearby Search for `bar`, `night_club`, and `restaurant`.
  - Dedupes by `place_id`.
  - Stores only Google Place photo references/URLs; no demo, stock, generated, or AI fallback photos.
- `src/app/api/jobs/discover-zone/route.ts`
  - Protected job route for discovery.
  - Requires `CRON_SECRET` via `Authorization: Bearer <secret>` or `?secret=<secret>`.
  - Upserts venues by `place_id`.
- `src/app/api/venues/route.ts`
  - Consumer venue list now reads cached Supabase venues only.
  - No Google or BestTime calls during normal page reads.
- `src/app/api/venues/[id]/route.ts`
  - Venue detail now reads cached Supabase venue rows only.
- `supabase/schema.sql`
  - Adds `zones`.
  - Adds cached Places fields to `venues`: `photo_url`, `category`, `zone_id`, `hidden`.
  - Seeds `south-end-charlotte`.

### Agent B: BestTime

Commit:
- `feec2d4` Add BestTime and signal-backed check-ins

Changed:
- `src/lib/besttime.ts`
  - Adds server-only BestTime live/forecast adapter using `BESTTIME_API_KEY`.
  - Writes `besttime_venue_id`, `busyness_0_100`, `busyness_source`, and `last_busyness_refresh`.
- `src/app/api/jobs/refresh-busyness/route.ts`
  - Protected refresh job using `CRON_SECRET`.
  - No BestTime calls happen during normal page render.
- `supabase/schema.sql`
  - Adds BestTime cache fields to `venues`.
  - Adds `venue_signals` read model.

### Agent C: Check-In + M/F Signal Engine

Commit:
- `feec2d4` Add BestTime and signal-backed check-ins

Changed:
- `src/app/api/check-ins/route.ts`
  - Replaces old `crowdLevel/vibeScore/sessionId` payload with `busyness`, `crowdFeel`, and optional `note`.
  - Requires a logged-in Supabase user for POST.
  - Recomputes `VenueSignal` after insert.
- `src/lib/signals.ts`
  - Adds recency weighting with `w = 0.5^(age_minutes / 45)`.
  - Hides M/F ratio when effective sample size is below `2`.
  - Computes confidence with `N_eff / (N_eff + 3) * agreement`.
- `src/app/page.tsx`, `src/app/venues/[id]/page.tsx`, `src/app/vibe-check/page.tsx`, `src/app/profile/page.tsx`
  - Reads cached venues/signals and submits the new report shape.
- `src/app/api/__tests__/check-ins.test.ts`
  - Updates API tests for auth-required check-ins, signal recompute, and new summary shape.

## Left For Next Agents

### Agent D: Auth + Admin Cleanup
- Keep email auth only.
- Guests can browse cached venues/signals.
- Add thin protected `/admin` for hiding/removing bad venues/check-ins.
- Remove any remaining owner-role assumptions if found.

## Verification

- `npm run type-check` passed.
- `npm test -- --run` passed.
- `npm run build` passed.

## Worker Instructions

- Commit every step with clear messages.
- Keep deletions separate from replacements.
- Do not leave half-finished deletions or partial Agent B/C/D work.
- Update this handoff before stopping.

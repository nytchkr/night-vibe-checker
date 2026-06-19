# VibeCheck Reset Handoff

Date: 2026-06-19
Repo: `/Users/admin/night-vibe-checker`

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

## Left For Next Agents

### Agent B: BestTime
- Add `BESTTIME_API_KEY` server-only adapter.
- Add scheduled/protected refresh job.
- Add `besttime_venue_id`, `busyness_0_100`, `busyness_source`, `last_busyness_refresh`.
- Write busyness into the future `VenueSignal` read model.
- Do not call BestTime during normal page render.

### Agent C: Check-In + M/F Signal Engine
- Replace current check-in contract with:
  - `busyness: dead | moderate | packed`
  - `crowd_feel: mostly_male | mostly_female | balanced | mixed`
  - optional `note`
- Require logged-in users to report.
- Add `VenueSignal` with recency-weighted M/F logic:
  - `w = 0.5^(age_minutes / 45)`
  - hide M/F ratio when `N_eff < 2`
  - confidence `N_eff / (N_eff + 3) * agreement`
- Only the signal engine writes `VenueSignal`.

### Agent D: Auth + Admin Cleanup
- Keep email auth only.
- Guests can browse cached venues/signals.
- Reporting requires login.
- Add thin protected `/admin` for hiding/removing bad venues/check-ins.
- Remove any remaining owner-role assumptions if found.

## Worker Instructions

- Commit every step with clear messages.
- Keep deletions separate from replacements.
- Do not leave half-finished deletions or partial Agent B/C/D work.
- Update this handoff before stopping.

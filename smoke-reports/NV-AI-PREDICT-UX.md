# NV-AI-PREDICT-UX

Date: 2026-06-25
Agent: ux-ui-agent
Scope: UX discovery only. No source implementation changes.

## Files Reviewed

- `src/app/venues/[id]/page.tsx`
- `src/app/venues/[id]/VenuePageClient.tsx`
- `src/components/BusynessBadge.tsx`
- `src/components/BusynessMeter.tsx`
- `src/components/MFRatioBar.tsx`
- `src/components/MFBar.tsx`
- `src/components/SignalFreshnessLabel.tsx`
- `src/components/SkeletonVenueDetail.tsx`
- `src/components/ui/skeleton.tsx`
- `src/types/consumer.ts`
- `src/app/api/venues/[id]/prediction/route.ts`

## Current Venue Detail Audit

The venue detail page is server-loaded through `getConsumerVenueById()` in `page.tsx`, then rendered by `VenuePageClient`. The client layout currently flows as:

1. Hero photo, back/save/share actions, category, price, venue name, open badge, Google rating, check-in/report buttons, hours.
2. Horizontal signal strip with three compact cards: Busyness, M/F ratio, Status.
3. Main content stack: Who's here, Right now, VenueRating, VenueTips, Tonight forecast, directions/website/phone, report link.

Busyness appears in two places:

- Compact strip directly below the hero.
- The "Right now" section, where `BusynessMeter` shows level, percent, source badge, confidence text, and the share action.

M/F ratio also appears in two places:

- Compact strip directly below the hero.
- The "Right now" section.

The active M/F component is `MFRatioBar`, which intentionally hides the ratio unless `sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO`. The current constant is 5, while the AI prediction feature spec says crowd profile forecast can appear only if there are at least 3 check-ins. Engineers should reconcile this threshold explicitly instead of accidentally mixing the existing public M/F display threshold with the AI forecast threshold.

Current empty states:

- Busyness: "No crowd data yet"
- M/F ratio: "Not enough data yet"
- Whole signal prompt: "No live reads yet - be the first to report"
- Recent vibes: "No vibes reported yet - be the first!"
- BestTime not connected: "No BestTime forecast is connected for this venue yet"
- BestTime unavailable: "BestTime forecast is unavailable right now"
- BestTime no hours: "BestTime has no hourly forecast for today"

There is already a public `GET /api/venues/[id]/prediction` route, but it returns a BestTime or Google fallback prediction and does not implement the new AI honesty contract, check-in basis copy, or paid/free split. The AI feature should use the requested `/api/venues/[id]/predict` endpoint, or the existing endpoint must be renamed/refactored so product copy never presents a Google fallback as an AI forecast.

## Recommended Placement

Place the AI prediction module immediately after the "Right now" section and before `VenueRating` and `VenueTips`.

Reasoning:

- It keeps raw observed signals first, then shows the AI interpretation as a clearly secondary layer.
- It stays above ratings/tips and the existing full BestTime hourly forecast, so mobile users see the useful "when should I go" answer without scrolling through lower-priority content.
- It avoids competing with the hero CTAs and the compact signal strip, which should remain fast-glance current-state UI.
- It allows the footer attribution to point users down to the existing "Tonight forecast" section if they want the raw hourly BestTime data.

Do not place the AI card inside the horizontal signal strip. That strip already mixes current busyness, ratio, and open status. AI predictions are forecast interpretations and need more copy space for source and quality labels.

## Proposed Components

- `VenuePredictionCard`
- `PredictionChip`
- `PredictionSkeleton`
- `PredictionQualityLabel`
- `PredictionPaywallChip`
- `PredictionEmptyState`

Suggested integration point:

```tsx
<VenuePredictionCard
  venueId={venue.id}
  checkInCount={mfSampleSize}
  hasBestTimeVenue={Boolean(venue.besttimeVenueId)}
/>
```

The card should own its fetch to `/api/venues/[id]/predict`, similar to `BestTimeForecastSection`. On `nightvibe:check-in-created`, it should refetch or show a small "Updating forecast" loading affordance because the report basis changed.

## Visual Direction

Use a single dark card, not nested cards:

- Container: rounded `18px`, `border-white/[0.08]`, `bg-white/[0.04]`, `p-4`.
- Accent: violet `#8B6CFF` for the card eyebrow, focus rings, primary chip border, and free prediction icon.
- Support accent: pink `#F0568C` only for crowd profile or paid-gate emphasis, not as the dominant card color.
- Background remains `#0A0A0E`.
- Mobile width: designed for 390px with one-column content and horizontally scrollable chips only if copy stays short. Prefer a vertical chip stack if API returns more than 2 unlocked insights.
- Use lucide icons in implementation: `Sparkles` for AI forecast, `Clock3` for best time, `TrendingUp`/`TrendingDown` for vibe trend, `Users` for crowd profile, `Lock` for paid chips, `Info` for source details.

Header:

- Eyebrow: `AI forecast`
- Title: `Best time tonight`
- Required source label below title: `AI forecast - based on BestTime data + {N} check-in reports`
- Never show a `LIVE` badge in this card.

Footer:

- If BestTime data is used: `Powered by BestTime + {N} reports`
- If BestTime is missing: `Based on {N} check-in reports`
- If no check-ins and no forecast: show the empty state, not an attribution footer.

## Prediction Chip Designs

Free v1 chip:

- Type: Best time to visit
- Icon: `Clock3`
- Label examples:
  - `Best tonight: 10 PM-midnight`
  - `Best Friday: 9-11 PM`
  - `Best after 10 PM`
- Body: one short support line, max 2 lines:
  - `Based on BestTime peak and recent crowd feel.`
- Quality text under chip:
  - `BestTime + 7 reports`
  - `BestTime + 2 reports`
  - `BestTime only`
- Style: violet border `#8B6CFF/45`, subtle violet background `#8B6CFF/10`, white primary text.

Paid v1.1 locked chips:

- Type: Full crowd forecast
- Icon: `Lock` + `Clock3`
- Label: `Full crowd forecast`
- Body: `Hourly crowd windows`
- Quality text: `BestTime data`
- Style: white border `white/10`, dark surface `white/[0.035]`, lock icon in violet.

- Type: Vibe trend
- Icon: `Lock` + `TrendingUp` or `TrendingDown`
- Label: `Vibe trend`
- Body: `Up or down vs. typical`
- Quality text: `{N} recent reports`
- Style: white border `white/10`, dark surface, trend accent can be violet for up and white/45 for down until real data exists.

- Type: Crowd profile
- Icon: `Lock` + `Users`
- Label: `Crowd profile`
- Body: `Predicted M/F mix`
- Quality text:
  - If `N >= 3`: `{N} reports`
  - If `N < 3`: `Needs 3 reports`
- Style: white border, small M/F mini bar may appear only after unlock and only when API returns real ratio basis.

Unlocked paid chips should never show invented percentages. If the API cannot return a real value, keep the chip present but switch its value line to an unavailable state.

## Data Quality Indicator

Every chip needs a small source line under the primary value. Use this pattern:

```text
BestTime + 7 reports
```

Rules:

- If fewer than 3 check-ins: show `Not enough reports yet - be the first to check in` for report-dependent predictions.
- Best time can still render with BestTime-only data if the endpoint has real BestTime forecast data, but it must say `BestTime only` or `BestTime + 0 reports`.
- Crowd profile forecast must not render a ratio or lean unless `checkInCount >= 3` and the API returns a real check-in-derived basis.
- Avoid generic confidence labels like "High confidence" unless the API provides a transparent reason. Prefer source basis labels because they are more honest.
- If confidence is still required by product, map it from evidence, not from AI tone:
  - `BestTime + 8+ reports`: `Strong signal`
  - `BestTime + 3-7 reports`: `Early signal`
  - `BestTime only`: `Forecast only`
  - `<3 reports`: `Needs reports`

## Loading State

Use `PredictionSkeleton` while `/api/venues/[id]/predict` is fetching.

Skeleton spec:

- Keep the card's final dimensions close to loaded state to avoid mobile layout jump.
- Header skeleton: one 80px x 12px eyebrow line and one 150px x 20px title line.
- Chip skeletons: 3 placeholders.
  - First placeholder full width, height 78px, violet-tinted pulse background `#8B6CFF/10`.
  - Second and third placeholders two-column on desktop, stacked on 390px mobile, height 68px, `white/10`.
- Footer skeleton: one 180px x 11px line.
- Animation: reuse existing `Skeleton` pulse behavior. Do not add shimmer-heavy gradients to avoid competing with the dark venue detail surface.
- ARIA: wrapper `role="status"` and `aria-label="Loading AI forecast"`.

## Empty And Error States

Primary empty state when prediction is unavailable:

```text
Not enough reports yet - be the first to check in
```

Use this when:

- Fewer than 3 check-ins and the endpoint cannot return a BestTime-based best-time chip.
- AI endpoint returns `available: false`.
- The venue has no BestTime forecast and no usable reports.

BestTime missing but reports exist:

```text
Forecast needs more source data
```

Support line:

```text
Check-ins are coming in, but this spot does not have a BestTime forecast yet.
```

Endpoint failure:

```text
Forecast unavailable right now
```

Support line:

```text
Current vibe data is still visible above.
```

Do not show a retry button in v1 unless the endpoint failure is common enough to justify it. The venue page already has many actions, and the card can retry on page refresh or check-in-created event.

## Paid Tier Gate

Free:

- `Best time to visit`: one unlocked chip.
- It can use BestTime forecast plus real check-in reports.
- It must include the required label: `AI forecast - based on BestTime data + {N} check-in reports`.

Paid v1.1:

- `Full crowd forecast`
- `Vibe trend`
- `Crowd profile`

Gate pattern:

- Show locked chips beneath the free best-time chip so users understand what exists later.
- Use low-pressure copy: `Unlock later` or `Included in Pro later`, because canonical plan says no payments in MVP.
- Do not link to checkout in MVP.
- If an `/upgrade` route remains in product, this card should not drive users there until the orchestrator explicitly reopens paid tier work.

Recommended locked footer:

```text
More real-data forecasts are planned for Pro. No invented crowd data.
```

## API Contract Notes For Engineers

The UI needs the new prediction response to include source basis data directly. Suggested shape:

```ts
type VenueAiPredictionResponse = {
  available: boolean;
  generatedAt: string;
  label: "AI forecast";
  sourceLabel: string; // "AI forecast - based on BestTime data + 7 check-in reports"
  attribution: string; // "Powered by BestTime + 7 reports"
  checkInCount: number;
  usesBestTime: boolean;
  free: {
    bestTimeToVisit?: {
      title: string;
      detail: string;
      qualityLabel: string;
    };
  };
  paidPreview: Array<{
    type: "full_crowd_forecast" | "vibe_trend" | "crowd_profile";
    title: string;
    detail: string;
    qualityLabel: string;
    locked: true;
  }>;
  emptyReason?: "not_enough_reports" | "no_besttime" | "unavailable";
};
```

The API should send presentation-safe strings for AI summaries, but the client should still enforce source labels and gates. If `checkInCount < 3`, the UI must not render crowd profile values even if a malformed response includes them.

## Implementation Acceptance Criteria

- The card appears after "Right now" and before ratings/tips.
- The card never uses `LIVE`.
- Every AI output includes `AI forecast - based on BestTime data + {N} check-in reports`.
- Fewer than 3 check-ins shows `Not enough reports yet - be the first to check in` for report-dependent predictions.
- BestTime attribution appears whenever BestTime powers the response.
- No fabricated busyness percentages or M/F percentages are rendered.
- Free MVP surface shows only the best-time chip as unlocked.
- Paid v1.1 chips are visible as locked previews without checkout flow.
- Loading skeleton is stable at 390px mobile width.
- On check-in submission, the card refetches or visibly updates its source basis.

## Recommended First Engineering Pass

1. Add `VenuePredictionCard` in `src/components/VenuePredictionCard.tsx`.
2. Add a typed client fetch for `/api/venues/[id]/predict`.
3. Wire the card into `VenuePageClient` after the current "Right now" section.
4. Keep the existing raw `BestTimeForecastSection` below tips for users who want the hourly detail.
5. Add unit tests or component tests for the honesty gates: no live badge, fewer than 3 reports, BestTime attribution, locked paid chips.

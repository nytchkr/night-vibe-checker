# NV-BUG-018 Fallback Venue Purge

Date: 2026-06-22

## Scope

Removed all Supabase `venues` rows matching either condition:

- `place_id LIKE 'fallback:%'`
- `photo_url ILIKE '%unsplash.com%'`

Matching `venue_signals` rows were deleted first by `venue_id`.

## Removed Rows

Venues removed: 6

Venue signals removed: 6

| Venue | Venue ID | Reason |
| --- | --- | --- |
| Caabo | 322d81e5-fc36-4a0f-ab14-43c43483a3be | fallback place_id and Unsplash photo_url |
| Good Bottle Co. | 869f1a04-d302-437a-800a-912d70c59c5b | fallback place_id and Unsplash photo_url |
| OMB Brewery | 92277d30-2a22-4d67-923f-78b1ec105570 | fallback place_id and Unsplash photo_url |
| The Peculiar Rabbit | d3e75210-d457-4ef6-9754-88dd70ea0fe5 | fallback place_id and Unsplash photo_url |
| The Station | 550813ed-720e-4f99-be22-3070ca87ad41 | fallback place_id and Unsplash photo_url |
| Unknown Brewing Co. | 7603cf83-a46a-4dcb-a3b8-6cd7c378a5f5 | fallback place_id and Unsplash photo_url |

## Verification

Post-delete verification query for `place_id LIKE 'fallback:%' OR photo_url ILIKE '%unsplash.com%'` returned 0 venue rows.

No API keys or secrets are included in this report.

# NV-PLACES-PHOTOS Production Photo Enrichment

Date: 2026-06-22
Agent: dev-tech-agent

## Scope

Updated production Supabase `venues` rows where `photo_url` was `NULL` or used an Unsplash fallback. Google Places was the only photo source.

## Method

- Loaded production credentials from `.env.local`.
- Queried `venues` with `place_id IS NOT NULL` and `photo_url IS NULL OR photo_url ILIKE '%unsplash%'`.
- Fetched photo references through Google Place Details.
- For seeded fallback IDs (`fallback:south-end-charlotte:*`), resolved only high-confidence Google Text Search matches, then fetched photos through Place Details.
- Updated `photo_url` and `photo_urls` together. For resolved fallback rows, also replaced the fallback `place_id` with the Google Place ID.

## Result

- Candidate venues checked: 13
- Google place IDs resolved from fallback IDs: 5
- Venues enriched with Google Places photos: 4
- Venues skipped because Place Details returned no photo references: 4
- Venues skipped because no safe Google match was found: 5
- Failures: 0

## Enriched Venues

- Leroy Fox
- Prohibition
- Sugar Creek Brewing
- Sycamore Brewing

## Remaining Rows Not Enriched

- No safe Google match: Caabo, Good Bottle Co., OMB Brewery, The Peculiar Rabbit, Unknown Brewing Co.
- No Google photo references from Place Details: Love CLT, Luna Lounge Llc, Privilege Night Club, The Station

## Verification

Post-run Supabase verification showed each enriched venue has:

- A non-fallback Google Place ID
- `photo_url` starting with the Google Places Photo endpoint
- `photo_urls` populated with 3 Google Places Photo URLs


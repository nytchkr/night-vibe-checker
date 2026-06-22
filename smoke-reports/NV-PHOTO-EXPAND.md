# NV-PHOTO-EXPAND

Generated: 2026-06-22T04:43:15.006Z

## Summary

- Attempted: 9
- Enriched: 0
- Resolved fallback place IDs: 0
- Skipped: 9
- Failed: 0
- Production photo coverage after run: 115/124 real Google Places photo URLs
- Remaining Unsplash URLs: 6
- Remaining null photo URLs: 3
- Remaining other photo URLs: 0

## Method

- Queried production Supabase for venues where `photo_url` is null or contains `unsplash`.
- Used Place Details `fields=photos` directly for `ChIJ` Google Place IDs.
- Used Text Search query `<venue name> South End Charlotte NC` for `fallback:` IDs and updated only when normalized name similarity was greater than 0.8.
- Wrote only Google Places Photo API URLs built from returned `photo_reference` values.
- Batches ran in groups of 10 with a 200ms delay between venue attempts.

## Results

- SKIPPED: Caabo (322d81e5-fc36-4a0f-ab14-43c43483a3be); photos=0; match="PARA Charlotte" confidence=0.200; reason=no high-confidence Text Search match (status=OK)
- SKIPPED: Good Bottle Co. (869f1a04-d302-437a-800a-912d70c59c5b); photos=0; match="Bloom & Bottle" confidence=0.625; reason=no high-confidence Text Search match (status=OK)
- SKIPPED: Love CLT (9a1433b9-b495-4f6b-85a5-9a8dab74ab21); photos=0; reason=no photo references (details status=OK)
- SKIPPED: Luna Lounge Llc (b976fd20-acc5-43c2-9ed1-da5a6fcd8a3e); photos=0; reason=no photo references (details status=OK)
- SKIPPED: OMB Brewery (92277d30-2a22-4d67-923f-78b1ec105570); photos=0; match="Wooden Robot Brewery" confidence=0.500; reason=no high-confidence Text Search match (status=OK)
- SKIPPED: Privilege Night Club (947f1694-c720-4928-b9c5-2752f1865d63); photos=0; reason=no photo references (details status=OK)
- SKIPPED: The Peculiar Rabbit (d3e75210-d457-4ef6-9754-88dd70ea0fe5); photos=0; match="The Rabbit Hole" confidence=0.133; reason=no high-confidence Text Search match (status=OK)
- SKIPPED: The Station (550813ed-720e-4f99-be22-3070ca87ad41); photos=0; match="Caswell Station" confidence=0.467; reason=no high-confidence Text Search match (status=OK)
- SKIPPED: Unknown Brewing Co. (7603cf83-a46a-4dcb-a3b8-6cd7c378a5f5); photos=0; match="HopFly Brewing Company" confidence=0.533; reason=no high-confidence Text Search match (status=OK)

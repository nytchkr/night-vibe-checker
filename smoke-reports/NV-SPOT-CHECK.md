# NV-SPOT-CHECK Production Venue Smoke Report

Checked: 2026-06-22T05:03:37.357Z
Production URL: https://night-vibe-checker.vercel.app/api/venues
Production response: HTTP 200, `status: success`, 123 venues

## Method

- Selected the first 3 venues from production `/api/venues` with:
  - `placeId` starting with `ChIJ`
  - non-null `signal.busyness0To100`
  - `photoUrl` from `maps.googleapis.com`
- Verified each `photoUrl` with `curl -I`.
- Looked up the matching private `besttime_venue_id` from the seeded server-side Supabase data for the same venue UUIDs.
- Called BestTime directly with `POST https://besttime.app/api/v1/forecasts?api_key_private=<redacted>&venue_id=<redacted>`.
  - BestTime form-body and JSON-body POSTs returned 400 for missing `api_key_private`; query-param POST returned 200 and is the format used for this check.
- Parsed the current venue-local forecast hour from BestTime response `analysis[day].day_raw[hour]`.
- Loaded production `/api/venues` 5 times in a row and compared the selected venues' `busyness0To100` and `lastBusynessRefresh`.
- Rechecked cached signal refresh timestamps after the reload loop.

## Result

Overall: **partial fail**.

- Photo URLs: **pass**. All 3 returned HTTP 302 redirects from `curl -I`.
- Five-reload stability: **pass**. `busyness0To100` stayed identical across all 5 loads for all 3 venues.
- No refresh during reloads: **pass**. `lastBusynessRefresh` stayed identical across all 5 production reads and the server-side signal timestamps were unchanged after the loop.
- BestTime current-hour match: **fail**. All 3 production cached busyness values were higher than the current BestTime values returned at check time.

## Venue Details

### Dilworth Neighborhood Grille

- Address: 911 East Morehead Street, Charlotte
- Google place_id: `ChIJr0fg_YWfVogR-pn_9djnJgI`
- Production busyness: `40`
- Production busyness_source: `forecast`
- Production last_busyness_refresh: `2026-06-22T04:14:55.445+00:00`
- BestTime current forecast: `25` for Mon 01:00 America/New_York
- BestTime direct response: HTTP 200, `status: OK`
- Photo URL status: HTTP 302
- Photo URL: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=AaVGc3nUTYTU1wT5vpX1-QjY3ocl2Aaek7jTFY4sliumOlY2pRX-traXQggBZr60I6ryQSRlPa8kINlpODtp7QBLGAmXrTcvWOVUA1W0gOFyDCNsxW0hMT8rJ_4s79ItajA4GCxtQU8H1Rcl9NWqME_FEftwWO85fjrsrRo8wLukrxPRAr3TBufU8UkWRGj7Xj8a0tHaAq64ZVZlu_ywPo_paZFNphjZcMkSIzA5C6pLoUZk2MpnSVE_fT9Bl44vpJyQVHrh9_Zq79a36RmuWaMTccYu_3FyBll0AFc5QrU0dr9tC0Ch8wL_kLNoKwTdMkdThOWc7Z6cgTZReUjoVY_fBM9-3zpckJMGsc4g2tPGxpdcoWRlTYQK1ir_XEsmiCm0b_Xi4BIL86Hjf0nYeFID9j5Eg79k1dFxXdqirgvhpECt3n_8&key=GOOGLE_API_KEY_REDACTED`
- Five reload busyness values: `40, 40, 40, 40, 40`
- Five reload refresh timestamps: all `2026-06-22T04:14:55.445+00:00`
- Reload test: **pass**
- BestTime match: **fail** (`40` shown vs `25` BestTime)

### Taboo Lounge & Hookah Bar

- Address: 710 West Trade Street h, Charlotte
- Google place_id: `ChIJZ8_cRuGhVogR4vGbUCQr6jA`
- Production busyness: `35`
- Production busyness_source: `forecast`
- Production last_busyness_refresh: `2026-06-22T04:09:06.834+00:00`
- BestTime current forecast: `25` for Mon 01:00 America/New_York
- BestTime direct response: HTTP 200, `status: OK`
- Photo URL status: HTTP 302
- Photo URL: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=AaVGc3mzOrDAdl-ZkDQhCMeVRsLUEUnIghuxjWSB79Lgtr1S73HFpribRw1r_cTAppUZ8t7-YPi5J3jiYJb3PUi7lx6GVd0bSDP8cByK--RDUyceqDorHV9QkD73pyu5oSGHue8vgcFJelvxgQ4KvqukJbqzlN52TuP21kQ7n8he1CGJBERcJW2PBgW2gXFujTfaCcrP3dFkWmKV5FOtaQdSwLaNUEbNKSmpJUzVDQkx5MGm_KqcowRNIYkm_1k9MadzfWLmdJK_qsX9JnPFztu6p1sTRNiHIaXeCwdS_PtVAUnKAdSCckEmhjmI02A0boqBMgdlqvZ87s1nnhnc80pae926HB05g_NHDFjsCye4KKCzlvDt4AMZ5rg4WTKSxX1Y6i5ve16PHXlcBcHbFh_7efWqgoo8V9TJXUNmREH_Hg_HTEhuPjcMWicWhubTkLv1GZrbmt31zwbbm7orAzvOOzZ-WGTaVFT99nz3KkwCNnWzX1n6cruwxc0TqJ8NnKxiHKx_LbsFzTQ1PU48HsgADfWRxkyS7ofx7oWe0fYTeFEJJ1kpFH5sbgaXALGH6604VeXmJvdiIc_oDkgDPqQHCHYSJP98YUCJohBBi-qCSuX9yuijVNIH-C3QIn4qudCA1eqneEs6&key=GOOGLE_API_KEY_REDACTED`
- Five reload busyness values: `35, 35, 35, 35, 35`
- Five reload refresh timestamps: all `2026-06-22T04:09:06.834+00:00`
- Reload test: **pass**
- BestTime match: **fail** (`35` shown vs `25` BestTime)

### Midnight Diner

- Address: 420 East Trade Street, Charlotte
- Google place_id: `ChIJeXjyeICfVogRK24wMhuRSr4`
- Production busyness: `25`
- Production busyness_source: `forecast`
- Production last_busyness_refresh: `2026-06-22T04:14:47.709+00:00`
- BestTime current forecast: `20` for Mon 01:00 America/New_York
- BestTime direct response: HTTP 200, `status: OK`
- Photo URL status: HTTP 302
- Photo URL: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=AaVGc3m9FsfKqsAF-4LOT2DixrjivGknIP6j3IdMQEWJjnRdjjUL1i-LVR0V4TNHGWPltSTl8pCqr3QPg4RxdUIUzzIRCbCYzYC32zFO_isTRgMCdm2H32HGv0JpcMzDaGpp4gcOCNbAO4S-VpxStKS2kxFUEnpktD-LmkYTFHgMMLckgUWgd_IxLwoQl85j1jRKoqKKv_VnIlpVrpef9IIn9aLv7g2UUNdwJB4LtlZ_rsjF2yb2arDeVlane6kYIVC5ZvcIcFcdSo0_UT-U46EPRJLPb0h0VjUh1k8bM-Y5HXIEU0KBkvZuC4PxAAyiTyJjsTVJZxqKbK6rNOHs2D76QnTrv5VdF78uG9BE7bS1tVOvkdlZU1jkPg48dy4pHC4hsnIaeG9bwaMBP_ZlsV_PP_KiNY__MR8vrtfMvv0lwtECGp-A71MW2VT1aqFIZ8GW&key=GOOGLE_API_KEY_REDACTED`
- Five reload busyness values: `25, 25, 25, 25, 25`
- Five reload refresh timestamps: all `2026-06-22T04:14:47.709+00:00`
- Reload test: **pass**
- BestTime match: **fail** (`25` shown vs `20` BestTime)

## Notes

- The five production reload responses had the same `meta.generatedAt` value (`2026-06-22T05:02:01.406Z`), consistent with the public cache headers on `/api/venues`.
- Server-side cached signal timestamps were also unchanged after the reload loop, confirming the read path did not trigger a busyness refresh.
- The observed mismatch is consistent with cached production values being from the prior refresh window rather than BestTime's current venue-local hour at 2026-06-22T05:03:37Z.

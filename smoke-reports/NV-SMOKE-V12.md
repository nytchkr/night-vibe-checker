# NV-SMOKE-V12 Production Smoke Report

Date: 2026-06-22
Target: https://night-vibe-checker.vercel.app

## Results

| Check | Result | Proof |
| --- | --- | --- |
| GET `/` | PASS | HTTP 200, 21001 bytes |
| GET `/map` | PASS | HTTP 200, 23991 bytes |
| GET `/explore` | PASS | HTTP 200, 34761 bytes |
| GET `/profile` | PASS | HTTP 200, 20312 bytes |
| GET `/api/health` | PASS | HTTP 200, JSON `status=degraded`, 197 bytes |
| GET `/sitemap.xml` | PASS | HTTP 200, 20670 bytes |
| `/map` desktop centered max-width container | PASS | Rendered production HTML contains `mx-auto w-full md:max-w-lg`; source `src/app/map/page.tsx` wraps `VenueMapClient` in `<div className="mx-auto w-full md:max-w-lg">` |

## Verification Command

Production checks were run with a Node HTTPS probe against:

```text
/
/map
/explore
/profile
/api/health
/sitemap.xml
```

All required NV-SMOKE-V12 checks passed.

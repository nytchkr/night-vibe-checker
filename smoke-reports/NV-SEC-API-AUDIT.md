# NV-SEC-API-AUDIT

Date: 2026-06-22
Agent: dev-tech-agent

Scope audited:
- `src/app/api/**`
- `src/lib/**`

## Findings

| Severity | Issue | File:line | Fix applied or recommended |
|---|---|---:|---|
| High | User-controlled venue identifiers were interpolated into Supabase PostgREST `.or()` filter strings. This is not raw SQL, but it can allow filter-string injection or malformed filter behavior. | `src/lib/consumerVenue.ts:115`, `src/app/api/venues/[id]/route.ts:154`, `src/app/api/venues/[id]/activity/route.ts:92`, `src/app/api/venues/[id]/signal/route.ts:54`, `src/app/api/venues/[id]/besttime-forecast/route.ts:55`, `src/app/api/check-ins/route.ts:167`, `src/app/api/venues/[id]/check-in/route.ts:120`, `src/app/api/venues/[id]/check-ins/route.ts:71`, `src/app/api/venues/[id]/report/route.ts:34`, `src/app/api/venues/[id]/tips/route.ts:53` | Fixed. Added `src/lib/venueLookup.ts` to normalize venue IDs, strip control characters, cap length, and resolve with separate `.eq("place_id", ...)` / UUID-only `.eq("id", ...)` queries. |
| High | Some `/api/admin/**` operational routes accepted bearer secrets instead of requiring the `ADMIN_PASSWORD`-derived `admin_auth` cookie before work. | `src/app/api/admin/stats/route.ts:8`, `src/app/api/admin/besttime-test/route.ts:26`, `src/app/api/admin/trigger-refresh/route.ts:10` | Fixed. All admin operational routes now call `isAuthorizedAdminRequest(req)` before any DB/upstream work. `/api/admin/auth` remains the cookie-issuing login route. |
| High | Route handlers returned raw upstream or internal error text to clients on protected job/admin failure paths. | `src/app/api/cron/refresh-busyness/route.ts:40`, `src/app/api/cron/refresh-open-now/route.ts:21`, `src/app/api/jobs/refresh-busyness/route.ts:26`, `src/app/api/jobs/refresh-open-now/route.ts:27`, `src/app/api/jobs/discover-zone/route.ts:25`, `src/app/api/venues/discover/route.ts:54`, `src/app/api/admin/besttime-test/route.ts:67`, `src/app/api/admin/trigger-refresh/route.ts:61` | Fixed. Client responses now use generic messages; detailed errors remain server-side via `console.error`. |
| Medium | Missing Supabase env responses exposed exact env variable names to clients. No secret values were exposed, but this is unnecessary configuration disclosure. | `src/app/api/saved-venues/route.ts:80`, `src/app/api/check-ins/route.ts:106`, `src/app/api/track/route.ts:38`, `src/app/api/profile/notification-prefs/route.ts:35`, `src/app/api/push/venue-alert/route.ts:79`, `src/app/api/tips/[id]/helpful/route.ts:29`, `src/app/api/venue-ratings/route.ts:48`, `src/app/api/venues/[id]/alerts/route.ts:32`, `src/app/api/venues/[id]/check-in/route.ts:89`, `src/app/api/venues/[id]/report/route.ts:28`, `src/app/api/venues/[id]/tips/route.ts:37` | Fixed. Responses now say `Server configuration is incomplete.` and keep exact missing names in server logs only. |
| Low | Static `.or("besttime_venue_id.is.null,besttime_venue_id.eq.")` remains in admin stats. | `src/lib/adminStats.ts:70` | No fix needed. This string is static, not user-controlled, and does not create injection surface. |
| Low | Secret-looking strings found in API/lib tests are dummy values. | `src/app/api/__tests__/*` | No fix needed. No hardcoded production API keys, passwords, service-role keys, OpenAI keys, Google keys, BestTime keys, or cron secrets were found in `src/app/api/**` or `src/lib/**`. |
| Low | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used in server/client Supabase auth flows. | `src/lib/supabase.ts:23`, `src/lib/supabase.ts:29`, `src/lib/supabase-browser.ts:10`, `src/lib/supabase-browser.ts:11` | No fix needed. These are intentionally public Supabase values. No sensitive `NEXT_PUBLIC_` variables for service-role, BestTime private key, Google Places server key, OpenAI, `CRON_SECRET`, or `ADMIN_PASSWORD` were found. |

## Supabase Access Review

- Public read endpoints use service-role reads only for curated public data and apply visibility filters such as `hidden=false`.
- User-scoped endpoints validate Supabase bearer/cookie sessions before reading or writing user data.
- Admin endpoints use the `ADMIN_PASSWORD`-derived `admin_auth` cookie before service-role table access.
- Cron/job endpoints require `CRON_SECRET` before protected writes or refresh work.
- No raw SQL execution or dynamic SQL string concatenation was found in the audited API/lib scope.

## Input Sanitization Review

- Check-in notes, venue tips, venue reports, ratings, push subscriptions, saved venues, profile gender/preferences, and analytics events are validated with Zod or explicit type checks before DB writes.
- Venue lookup inputs now pass through `normalizeVenueLookupId()` before DB lookups.
- Search/query style inputs in audited API routes are bounded by explicit limits and do not flow into raw SQL.

## Redaction

No secret values are included in this report. Any credential value encountered in environment-dependent code paths is treated as `[redacted]`.

# NV-SEC-AUDIT-001 - NightVibe API Route Security Audit

Date: 2026-06-22
Scope: `src/app/api/**/*.ts`

## Summary

Audited all API route files for auth boundaries, `supabaseAdmin` service-role usage, input validation, write endpoint rate limiting, cron secret handling, and unsafe `NEXT_PUBLIC_` env exposure.

Critical issues found: 0
Medium issues found and fixed: 5
Low issues documented only: 4

## Route Audit

| Route | Auth Required | Issue Found | Severity |
|---|---:|---|---|
| `/api/account/delete` | User Bearer token | Uses `supabaseAdmin` only after token resolves to the current user. | Low |
| `/api/activity/feed` | Public | Uses service role for public feed; omits private profiles and exposes public profile/venue summary only. | Low |
| `/api/admin/auth` | Admin password | Fixed: legacy GET accepted password in query string; now redirects to POST login flow. | Medium |
| `/api/admin/besttime-test` | Admin cookie | Admin cookie check present; BestTime response sanitizes private key fields. | Low |
| `/api/admin/check-ins` | Admin cookie | Service role is appropriate for moderation after admin cookie check. | Low |
| `/api/admin/check-ins/[id]` | Admin cookie | PATCH/DELETE guarded by admin cookie; body validates `hidden` boolean. | Low |
| `/api/admin/stats` | Admin cookie | Admin cookie check present. | Low |
| `/api/admin/trigger-refresh` | Admin cookie + internal cron secret | Admin cookie required; internal cron call sends secret via header. | Low |
| `/api/admin/venues/[id]` | Admin cookie | PATCH/DELETE guarded by admin cookie; body allowlist validates `hidden`. | Low |
| `/api/auth/google` | Public OAuth start | Return path constrained to same-origin relative paths; no secret exposure. | Low |
| `/api/check-ins` | POST user Bearer token; GET public aggregate | POST auth, zod validation, duplicate guard, and rate limiting present; GET returns public sanitized recent check-ins/signals. | Low |
| `/api/check-ins/me` | User Bearer token | User token required before service-role query filters by `user_id`. | Low |
| `/api/cron/refresh-busyness` | Cron secret | Bearer or `x-cron-secret` accepted only when `CRON_SECRET` exists. | Low |
| `/api/cron/refresh-open-now` | Cron secret | Fixed: now uses shared cron auth and accepts header secret only when `CRON_SECRET` exists. | Medium |
| `/api/cron/refresh-places-details` | Cron secret | Fixed: now uses shared cron auth and accepts consistent secret headers only when configured. | Medium |
| `/api/cron/refresh-signals` | Cron secret | Re-export of `/api/cron/refresh-busyness`; inherits valid cron auth. | Low |
| `/api/cron/send-alerts` | Cron secret | Fixed: now uses shared cron auth and consistent header handling. | Medium |
| `/api/health` | Public | Public health endpoint exposes aggregate table availability/counts. No secret data. | Low |
| `/api/jobs/discover-zone` | Cron secret | Fixed: now uses shared cron auth and accepts header secret only when configured. | Medium |
| `/api/jobs/refresh-busyness` | Cron secret | Fixed: now uses shared cron auth and accepts header secret only when configured. | Medium |
| `/api/jobs/refresh-open-now` | Cron secret | Fixed: removed URL query secret acceptance; header-only cron auth now required. | Medium |
| `/api/profile/check-ins` | User cookie or Bearer token | Auth required before service-role query filters by `user_id`; output is current user's rows. | Low |
| `/api/profile/gender` | User cookie/Bearer via Supabase SSR | Auth required; zod enum validation. Uses anon client/RLS, not service role. | Low |
| `/api/profile/notification-prefs` | User Bearer token | Auth required; zod validation; service role query scoped by `user_id`. | Low |
| `/api/profile/streak` | User cookie or Bearer token | Auth required; service role query scoped by `user_id`. | Low |
| `/api/push/subscribe` | User cookie or Bearer token | Auth required; zod validates subscription shape; service role scoped by `user_id`. | Low |
| `/api/push/venue-alert` | User cookie or Bearer token | Auth required for GET/POST/DELETE; zod validates venue alert payload. | Low |
| `/api/saved-venues` | User cookie or Bearer token | Auth required; zod validates place/venue IDs and alert threshold. | Low |
| `/api/subscription/status` | Optional user auth | Read-only paid-tier placeholder/status. No write or secret exposure. | Low |
| `/api/tips/[id]/helpful` | Public | Fixed: public helpful vote now has per-IP rate limiting. | Medium |
| `/api/track` | Public analytics write | zod validation and per-IP rate limiting present. | Low |
| `/api/venue-ratings` | POST user Bearer token; GET public/current-user split | POST auth and zod validation present. No rate limit; lower abuse impact than check-ins/reports/tips. | Low |
| `/api/venues` | Public | Public launch-zone venue search; rate limited; service role reads visible venue fields. | Low |
| `/api/venues/[id]` | Public | Public detail route; rate limited; uses shared consumer venue mapper. | Low |
| `/api/venues/[id]/activity` | Public | Public recent activity; filters hidden rows and maps only public profile metadata. | Low |
| `/api/venues/[id]/alerts` | User Bearer token | DELETE auth required and scoped by `user_id`. | Low |
| `/api/venues/[id]/besttime-forecast` | Public | Public forecast read; rate limited. | Low |
| `/api/venues/[id]/check-in` | User Bearer token | Fixed: authenticated check-in write now has per-IP rate limiting. | Medium |
| `/api/venues/[id]/check-ins` | Public | Public recent check-ins; filters hidden rows and returns sanitized note/gender/time fields. | Low |
| `/api/venues/[id]/report` | Public anonymous write | Fixed: anonymous report write now has per-IP rate limiting. | Medium |
| `/api/venues/[id]/save` | User cookie/Bearer token | Auth required; zod validates alert threshold. Service role scoped by `user_id`. | Low |
| `/api/venues/[id]/signal` | Public | Public signal read only; no raw user data. | Low |
| `/api/venues/[id]/tips` | GET public; POST user Bearer token | Fixed: authenticated tip write now has per-IP rate limiting. GET returns public visible notes only. | Medium |
| `/api/venues/discover` | Cron secret | Protected by `x-cron-secret`; curl docs use env var placeholder only. | Low |
| `/api/venues/saved` | User cookie or Bearer token | Auth required before service-role query filters by `user_id`. | Low |
| `/api/venues/trending` | Public | Public visible venue read; rate limited. | Low |
| `/api/widget/[venueId]` | Public | Public embeddable venue/signal read only. | Low |

## Fixed Issues

1. Disabled legacy GET password login in `/api/admin/auth`; GET now redirects to `/admin/login` and only POST accepts the password in a JSON body.
2. Added shared cron auth helper requiring configured `CRON_SECRET` and accepting only `Authorization: Bearer ...` or `x-cron-secret`.
3. Removed URL query secret acceptance from `/api/jobs/refresh-open-now`.
4. Added per-IP rate limiting to scoped check-in, anonymous report, authenticated tip, and public tip-helpful write endpoints.
5. Standardized rate-limit response headers and `Retry-After` responses for the newly protected write endpoints.

## Low Issues / Follow-Up

| Finding | Severity | Recommendation |
|---|---:|---|
| Several public read routes use `supabaseAdmin` to bypass RLS for cached venue/signal reads. | Low | Acceptable for MVP because returned fields are public and hidden rows are filtered. Longer term, prefer anon/RLS-backed read clients for public reads where practical. |
| `/api/health` exposes aggregate table counts. | Low | Keep if useful for ops; otherwise make the count detail admin-only before launch hardening. |
| Authenticated non-core writes such as saved venues, push alerts, subscriptions, notification prefs, and ratings are not all rate limited. | Low | Consider adding shared user/IP throttling if these become abuse targets. |
| Public browser env vars are present by design (`NEXT_PUBLIC_SUPABASE_*`, Google Maps browser key, VAPID public key, Sentry DSN). | Low | No server-only secret was found with a `NEXT_PUBLIC_` prefix. Confirm provider-side restrictions for public browser keys. |

## Verification

- `npm test -- --run src/app/api/__tests__/venue-report.test.ts src/app/api/__tests__/venue-tips.test.ts src/app/api/__tests__/check-ins.test.ts src/app/api/__tests__/refresh-busyness-cron.test.ts src/app/api/__tests__/trigger-refresh.test.ts` - PASS, 31 tests.
- `npx tsc --noEmit` - PASS after clearing stale generated `.next/types`.

No actual key values are included in this report.

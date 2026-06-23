# NV-INFRA-002-FIX Vercel Production Env Audit

Generated: 2026-06-22

## Commands

```bash
npx vercel env ls 2>&1 | grep -v '='
npx vercel env ls production 2>&1 | grep -v '='
```

No secret values were printed into this report.

## Set in Vercel

Production environment variable names currently present:

- ADMIN_PASSWORD
- BESTTIME_API_KEY
- CRON_SECRET
- GOOGLE_PLACES_API_KEY
- NEXT_PUBLIC_ENV
- NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_URL
- OPENAI_API_KEY
- SUPABASE_SERVICE_ROLE_KEY

Preview environment variable names noted:

- GOOGLE_PLACES_API_KEY

## Missing from Vercel

Required by NV-INFRA-002-FIX but not present in Vercel Production:

- GOOGLE_PLACES_KEY
- NEXT_PUBLIC_VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY

Related OAuth variables checked for NV-AUTH-001 and not present in Vercel Production:

- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET

Context variable from the blocker note not present in Vercel Production:

- SUPABASE_ACCESS_TOKEN

## Recommended Actions

- GOOGLE_PLACES_KEY: Either add this as a Production alias with the same Google Places credential, or update the required env checklist to use `GOOGLE_PLACES_API_KEY`. The current app code primarily expects `GOOGLE_PLACES_API_KEY`; several newer enrichment paths accept either `GOOGLE_PLACES_KEY` or `GOOGLE_PLACES_API_KEY`.
- NEXT_PUBLIC_VAPID_PUBLIC_KEY: Add to Vercel Production before push notification subscription UI is considered production-ready.
- VAPID_PRIVATE_KEY: Add to Vercel Production before scheduled push alert sending is enabled.
- GOOGLE_OAUTH_CLIENT_ID: If OAuth is expected to be configured through Vercel runtime envs, add it to Production. If Supabase owns Google OAuth secrets exclusively, document that this is intentionally absent from Vercel.
- GOOGLE_OAUTH_CLIENT_SECRET: If OAuth is expected to be configured through Vercel runtime envs, add it to Production. If Supabase owns Google OAuth secrets exclusively, document that this is intentionally absent from Vercel.
- SUPABASE_ACCESS_TOKEN: Add only to the automation environment that runs Supabase CLI/config tasks. Do not expose it to client code. It is not currently in the NV-INFRA-002-FIX runtime required list, but it was the named blocker for infrastructure automation.

## Result

The core production runtime variables for Supabase, BestTime, cron protection, and admin auth are present in Vercel Production. The required list is not fully satisfied because the VAPID variables are missing and the Google Places variable is present under `GOOGLE_PLACES_API_KEY`, not the requested `GOOGLE_PLACES_KEY` name.

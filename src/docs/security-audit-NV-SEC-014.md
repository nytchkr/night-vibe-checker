# NV-SEC-014 API Key Leakage Audit

Date: 2026-06-28
Agent: dev-tech-agent

## Scope

Audited `src/` and `next.config.mjs` for accidental exposure of server-side API keys. No environment files were committed, and no key values were printed or copied into this report.

## Checks Run

- Searched `src/` for prohibited public key names:
  - `NEXT_PUBLIC_` + `GOOGLE`
  - `NEXT_PUBLIC_` + `ANTHROPIC`
  - `NEXT_PUBLIC_` + `BESTTIME`
  - `NEXT_PUBLIC_` + `SUPABASE_SERVICE`
- Searched `src/` for direct server-side key reads:
  - `process.env.` + `GOOGLE_PLACES_API_KEY`
  - `process.env.` + `ANTHROPIC_API_KEY`
  - `process.env.` + `BESTTIME_PRIVATE_KEY`
- Reviewed `next.config.mjs` for `env: {}` exposure of sensitive keys.
- Reviewed import paths for Google Places, Anthropic, and BestTime key usage to confirm those reads stay in API routes, cron/job routes, server libraries imported by routes, or test setup.

## Findings

- No public Google, Anthropic, BestTime, or Supabase service-role key references were found in `src/` after removing one client-comment false positive.
- One public Google prefix false positive was found in a client-page comment documenting the public browser maps key. The comment was reworded so future audits do not flag it as a possible secret exposure. No runtime client read of a Google server key was found.
- The Google Places server key read appears only in:
  - `src/lib/places.ts`, imported by API job/discovery routes and tests.
  - `src/app/api/venues/[id]/route.ts`, an API route.
  - `src/app/api/venues/[id]/photos/route.ts`, an API route.
  - `src/test/setup.ts` and route tests with test placeholder values.
- The Anthropic server key read appears only in:
  - `src/app/api/venues/[id]/tips/route.ts`, an API route.
  - `src/app/api/__tests__/venue-tips.test.ts` with test placeholder values.
- The BestTime private-key search returned no direct reads in the audited baseline. BestTime server access uses the private API key only through `src/lib/besttime.ts`, which is imported by cron/job/API route code and tests, not client components.
- `next.config.mjs` contains an `env` block, but it only exposes `NEXT_PUBLIC_SITE_URL`. No Google Places, Anthropic, BestTime, or Supabase service-role key is exposed there.

## Result

No actual API key leakage was found in the audited source paths. The only code change was removing a misleading client-side comment match for the prohibited public Google search pattern.

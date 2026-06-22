# NV-PERF-LIGHTHOUSE-001 Performance Audit

Date: 2026-06-22
Agent: dev-tech-agent
Ticket: NV-PERF-LIGHTHOUSE

## Scope

Ran a quick performance audit for Night Vibe Checker focused on image handling, Next.js image configuration, unnecessary client boundaries, dynamic imports, production console logs, and build verification.

## Findings

- Raw `<img>` usage: none found under `src/`.
- Production `console.log`, `console.debug`, `console.info`: none found under `src/` outside tests/setup.
- Next image usage: existing venue/photo surfaces already use `next/image`.
- Below-fold image lazy loading: most venue/detail images already had `loading="lazy"`; the Explore activity avatar image was missing an explicit lazy hint.
- Dynamic imports: the largest map surface is already lazy-loaded through `src/components/VenueMapClient.tsx` with `ssr: false`; map bottom sheets are already dynamically imported from `src/components/VenueMap.tsx`.
- Client boundaries: `BusynessBadge`, `CategoryBadge`, and `VibeTagBadge` were marked `"use client"` despite being display-only modules without hooks or browser APIs.
- Next config: `compress: true` was already present; `poweredByHeader: false` was missing.
- Image remote patterns: Google Places-related hosts were partially allowed; Supabase storage hosts were missing.

## Fixed

- Added `poweredByHeader: false` to `next.config.mjs`.
- Added allowed image remote patterns for:
  - `maps.gstatic.com`
  - `storage.googleapis.com`
  - `**.googleusercontent.com`
  - `**.supabase.co`
- Added explicit `loading="lazy"` to Explore activity avatars.
- Removed unnecessary `"use client"` directives from:
  - `src/components/BusynessBadge.tsx`
  - `src/components/CategoryBadge.tsx`
  - `src/components/VibeTagBadge.tsx`

## Verification

- `rg -n "<img\\b" src --glob '!**/*.map'`: no matches.
- `rg -n "console\\.(log|debug|info)\\b" src --glob '!**/*.test.*' --glob '!src/test/**'`: no matches.
- `npx tsc --noEmit && npm run build 2>&1 | tail -20`: passed.
- `npm test -- --run`: passed, 33 files / 132 tests.

## Deploy

No deploy performed. Claude owns deployment.

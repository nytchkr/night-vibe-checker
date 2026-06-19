# AGENTS.md — Night Vibe Checker Multi-Agent System

> **This file is the law for all agents.**
> Every agent must read this before starting any work.
> Every agent must write to the Agent Board before stopping any work.
> The Agent Board lives at: `/Users/admin/jira-ticketing-mvp/app.js`

---

## Overview

Night Vibe Checker is built by a coordinated team of AI agents, each owning a distinct domain. No agent works in isolation. Every action is recorded on the Agent Board. Every bug, idea, and decision becomes a ticket.

The system has **10 active agents**, **1 orchestrator**, **1 senior scrum lead**, and **1 blocker-resolution owner** for explicit unblock work.

---

## Agent Registry

### 1. 🎯 Orchestrator — `mvp-night-vibe-builder`
**Model:** claude-sonnet-4-6
**Trigger:** Runs at the start of every session, after any major merge, or when called directly.

**Mission:** Keep the product moving. Decide what matters, assign it to the right agent, unblock everyone else.

**Responsibilities:**
- Read the full Agent Board before any sprint begins
- Prioritize tickets by impact on MVP demo-readiness
- Break epics into actionable tickets (≤5 story points)
- Assign every ticket to a specific agent — nothing stays unassigned
- Detect idle agents (no ticket activity in current session) and dispatch them
- Detect stale tickets (In Progress with no proof comment) and escalate
- Create new tickets when gaps are found in the product
- Write a board health summary at the end of every session

**What the Orchestrator does NOT do:**
- Does not write application code
- Does not run tests
- Does not make design decisions
- Does not close tickets — only the owning agent closes their own ticket

**Board protocol:**
```
Before session: read all In Progress + Selected tickets
After each decision: add comment → "ORCHESTRATOR: assigned NV-XXX to <agent> — reason: <why>"
End of session: update NV-031 (Board Health) with ticket counts + blockers
```

**Automatic triggers the Orchestrator acts on:**
- A ticket moves to Done → check if a follow-up ticket is needed
- A bug ticket is created by testing-agent → immediately assign to ux-ui-agent (UX bug) or dev-tech-agent (logic/API bug)
- A High priority ticket has no assignee → block until assigned
- The prod URL (`https://night-vibe-checker.vercel.app`) returns non-200 → create NV-INC-XXX incident ticket

---

### 2. 🔨 Dev & Tech Agent — `dev-tech-agent`
**Model:** claude-sonnet-4-6
**Trigger:** Called when a ticket is tagged `type: Task` and scope is API, database, business logic, or new feature.

**Mission:** Build correct, fast, secure backend and frontend logic. Own the technical foundation.

**Owns:**
- `/src/app/api/` — all API routes (vibe-check, venues, saved-spots, auth)
- `/src/lib/` — AI scoring engine, utils, Supabase clients
- `/src/types/` — TypeScript type definitions
- `supabase/migrations/` — database schema changes
- `next.config.ts` — build and runtime configuration
- `.env` files structure and documentation
- Third-party integrations (OpenAI, Google Places, Supabase)

**Responsibilities:**
- Implement new features end-to-end (API → types → component wiring)
- Fix logic bugs, data bugs, and API errors
- Run `npm run type-check` before every commit — zero TypeScript errors required
- Write or update unit tests for any business logic changed (`src/lib/__tests__/`)
- Document all API changes in the ticket's proof comment
- Never expose server-only keys to the client (`NEXT_PUBLIC_` prefix is forbidden for OpenAI/service-role/Places server key)

**Bug intake protocol:**
When testing-agent files a bug ticket tagged `type: Bug` and `scope: api` or `scope: logic`:
1. Read the reproduction steps from the ticket
2. Reproduce locally
3. Fix, write a regression test, and commit
4. Leave comment: `AGENT: dev-tech-agent | FIXED: <what changed> | COMMIT: <sha> | TEST: <test name>`

**What dev-tech-agent does NOT do:**
- Does not touch component visual styling (that's ux-ui-agent)
- Does not write E2E tests (that's testing-agent)
- Does not make product decisions (that's the orchestrator)

---

### 3. 🎨 UX/UI Agent — `ux-ui-agent`
**Model:** claude-sonnet-4-6
**Trigger:** Called when a ticket is tagged `type: Task` and scope is UI, design, accessibility, mobile, or visual bug.

**Mission:** Make Night Vibe Checker feel like a polished nightlife product. Every screen should be demo-ready before it ships.

**Owns:**
- `/src/app/page.tsx` — home feed
- `/src/app/vibe-check/page.tsx` — vibe check flow
- `/src/app/profile/page.tsx` — profile + saved spots
- `/src/app/discover/page.tsx` — discover/map page
- `/src/components/` — all UI components except API/data logic
- `/src/components/ui/` — shadcn/ui primitives
- `tailwind.config.ts` — design tokens, brand colors
- `src/app/globals.css` — CSS variables, base styles

**Responsibilities:**
- Run a visual QA pass on every screen after any feature merge
- Fix UX bugs: layout breaks, spacing issues, mobile overflow, missing loading states
- Use shadcn/ui components as the default — do not hand-roll primitives already in `/src/components/ui/`
- Maintain the Night Vibe brand: bg-deep `#0A0A0F`, neon-cyan `#00F5D4`, neon-magenta `#FF2D78`, purple-600 for CTAs
- Ensure bottom nav active state is always correct
- Run `npm run type-check` before committing — zero errors
- Run `npm test -- --run` to confirm no unit test regressions
- All changes must keep E2E passing (58 passing, 4 skipped is the baseline)

**Bug intake protocol:**
When testing-agent files a bug ticket tagged `type: Bug` and `scope: ui` or `scope: ux`:
1. Screenshot or reproduce the issue
2. Fix in the appropriate component
3. Verify fix on mobile viewport (375px width)
4. Leave comment: `AGENT: ux-ui-agent | FIXED: <component> | CHANGE: <what> | VERIFIED: mobile + desktop`

**What ux-ui-agent does NOT do:**
- Does not touch API routes or Supabase schema
- Does not write E2E test specs
- Does not change TypeScript types (unless purely UI-related prop types)

---

### 4. 🧪 Testing Agent — `testing-agent`
**Model:** claude-sonnet-4-6
**Trigger:** Called after any feature merge, on demand to audit for regressions, or autonomously to find bugs.

**Mission:** Be the product's immune system. Find bugs before users do. Report everything as a ticket.

**Owns:**
- `/e2e/` — all Playwright E2E specs
- `/src/lib/__tests__/` — Vitest unit tests for AI scoring
- `/src/app/api/__tests__/` — API route integration tests
- `playwright.config.ts` — E2E configuration
- Bug ticket creation — any bug found becomes a ticket immediately

**Responsibilities:**
- Run the full test suite after every merge: `npm run type-check && npm test -- --run && CI=1 npx playwright test`
- Baseline: **70 unit tests passing, 58 E2E passing, 0 failing**. Any deviation is a blocker.
- Write new E2E specs for any new user flow that ships without test coverage
- Explore the live production URL (`https://night-vibe-checker.vercel.app`) for bugs not caught by tests
- File every bug as a ticket with full reproduction steps (see Bug Ticket Template below)
- Re-run tests after every bug fix to confirm resolution
- Maintain the skipped test list — 4 tests are intentionally skipped; document why in the spec file

**Journey Verification protocol:**
- Use this for explicit journey-verifier work such as `NV-053` and for final MVP go/no-go evidence.
- The concept is whole-journey verification, not Fabroq-specific setup. Apply only the platform lane that exists for this project.
- For Night Vibe right now, verify web locally on `http://localhost:<port>`; do not claim a journey pass from production, code-reading, or green tickets alone.
- Cold state is required before each journey: clear localhost cookies/localStorage/sessionStorage or use a fresh browser context.
- Use a brand-new test account from the real sign-up flow when the journey includes auth.
- Walk every ordered step as a real user from first screen to completion. Never sign off because individual tickets are green.
- Judge like a user. A dead end, loop, "coming soon", confusing step, or nonsensical flow is a failure even if the UI technically responds.
- Capture screenshots or Playwright traces for each major step.
- If local setup cannot run, file a build-blocker or environment-blocker ticket and stop that platform lane.

**Bug Ticket Template (mandatory format):**
```
Title: [BUG] <short description of what's broken>
Type: Bug
Priority: High (broken feature) | Medium (degraded UX) | Low (cosmetic)
Scope: ui | api | logic | e2e | performance
Agent: testing-agent (reporter) → assign to correct fixer after filing

Description:
WHAT: <what is broken>
WHERE: <URL, component, or API route>
STEPS: <numbered reproduction steps>
EXPECTED: <what should happen>
ACTUAL: <what actually happens>
ENVIRONMENT: local dev | production | both
PROOF: <console error, screenshot description, or failing test name>
```

**What testing-agent does NOT do:**
- Does not fix bugs (reports them, then assigns to ux-ui-agent or dev-tech-agent)
- Does not make product or design decisions
- Does not modify application source code (only test files)

---

### 5. 🖥️ Codex Agent — `codex`
**Model:** codex-1 (OpenAI)
**Trigger:** Called for Agent Board UI work, or shadcn/ui component migration tasks.

**Mission:** Own the Agent Board UI and lead shadcn/ui migration of structural containers.

**Owns:**
- `/Users/admin/jira-ticketing-mvp/` — entire Agent Board project
- `/src/components/ui/` — shadcn/ui primitive components
- Structural wrappers: VibeReport card container, VenueCard structural wrapper, ShareButton

**Responsibilities:**
- Keep the Agent Board (`app.js`) rendering correctly as new tickets + agents are added
- Migrate hand-rolled component containers to shadcn/ui Card, Button, Badge primitives
- Read ticket comments left by Claude agents as handoff instructions
- Write DONE comments with commit SHA as proof
- Never break VibeTagBadge neon-glow styling — only migrate structural containers

**Sync protocol with Claude agents:**
- Claude agents leave `HANDOFF TO CODEX` comments on tickets before assigning to codex
- Codex reads those comments, does the work, and leaves `DONE (codex): <sha>` comment
- If Codex finds an issue with a handoff, it writes `BLOCKED: <reason>` and assigns back

---

### 6. 🧭 Senior Product UX Agent — `senior-product-ux-agent`
**Model:** gpt-5
**Trigger:** Called before/after major UX work, especially when the user says the product does not feel right.

**Mission:** Raise product clarity. Make sure the app feels like a coherent nightlife check-in product, not a pile of screens.

**Pairs with:** `ux-ui-agent`

**Owns:**
- Product narrative and first-screen clarity
- Information architecture and user flow critique
- Mobile ergonomics and demo story
- UX review comments that guide `ux-ui-agent`

**What this agent does NOT do:**
- Does not replace `ux-ui-agent`
- Does not own Tailwind implementation
- Does not close `ux-ui-agent` tickets

**Required comment format:**
```
AGENT: senior-product-ux-agent
STATUS: Done
PROOF: pages reviewed + viewport/screenshot proof
NEXT: exact UX actions for ux-ui-agent
```

---

### 7. 🏗️ Senior Full-Stack Architect — `senior-full-stack-architect`
**Model:** gpt-5-codex
**Trigger:** Called after schema/API work, before UI/testing depends on new data contracts.

**Mission:** Keep the app technically credible under production pressure.

**Pairs with:** `dev-tech-agent`

**Owns:**
- API contract review
- Supabase schema/RLS review
- Auth and anonymous session boundaries
- Data consistency, validation, error behavior, observability
- Severity-ranked architecture action items for `dev-tech-agent`

**What this agent does NOT do:**
- Does not replace `dev-tech-agent`
- Does not make product/design decisions
- Does not write UI or E2E tests

**Required comment format:**
```
AGENT: senior-full-stack-architect
STATUS: Done
PROOF: files/contracts reviewed
NEXT: required dev-tech-agent action items or no-blocker signoff
```

---

### 8. 🚦 Senior QA Release Agent — `senior-qa-release-agent`
**Model:** gpt-5-codex
**Trigger:** Called before demo/release, after regression runs, or when production reliability is uncertain.

**Mission:** Turn test output into a release decision.

**Pairs with:** `testing-agent`

**Owns:**
- MVP go/no-go checklist
- Production smoke plan
- Risk matrix and blocker severity
- Proof standards for closing test/release tickets

**What this agent does NOT do:**
- Does not replace `testing-agent`
- Does not fix bugs
- Does not change app code

**Required comment format:**
```
AGENT: senior-qa-release-agent
STATUS: Done
PROOF: tests/prod probes reviewed
NEXT: go/no-go, blockers, and required proof for testing-agent
```

---

### 9. 📋 Senior Scrum Lead — `senior-scrum-lead`
**Model:** gpt-5-codex
**Trigger:** Runs when the user asks for board ownership, every 60 minutes while active, after major agent updates, or when the board health is unclear.

**Mission:** Own Agent Board operating cadence. Keep tickets and agents moving with visible proof, direct comments, and escalation when work goes stale.

**Owns:**
- Agent Board hygiene and recurring sweep comments
- 60-minute active-ticket and agent-lane checks
- Stale work detection and escalation
- Owner assignment for unassigned or unclear tickets
- Direct next-action comments on each agent's highest-priority open ticket
- Board health summaries on `NV-045` and scrum-lead cadence proof on `NV-052`

**60-minute sweep protocol:**
1. Run `node scripts/agent-board-sync.mjs health` from `/Users/admin/jira-ticketing-mvp`.
2. Review every ticket where `status !== "Done"`.
3. Review every agent lane for recent proof or a clear standby reason.
4. Comment on stale, blocked, or ownerless work with one concrete next action.
5. Assign missing owners or escalate unclear ownership to `mvp-night-vibe-builder`.
6. Leave a sweep summary on `NV-052` and update `NV-045` when blockers change.

**What this agent does NOT do:**
- Does not write product code
- Does not replace `mvp-night-vibe-builder`
- Does not close another agent's ticket unless the owning agent already posted valid `DONE` proof
- Does not change final go/no-go; it feeds evidence to `NV-036`

**Required comment format:**
```
AGENT: senior-scrum-lead
STATUS: In Progress
PROOF: tickets/agents checked + stale/blocker evidence
NEXT: exact owner/action before the next 60-minute sweep
```

---

### 10. 🚧 Blocker Resolution Agent — `blocker-resolution-agent`
**Model:** gpt-5-codex
**Trigger:** Runs when a ticket is moved to `Blocker`, when an active ticket cannot progress because ownership/env/schema/deploy is unclear, or when the user asks to clear blockers.

**Mission:** Own the Blocker column and turn blocked work into a concrete fix path. This agent coordinates and unblocks; it does not replace specialist agents.

**Owns:**
- The Agent Board `Blocker` column
- Blocker triage and owner routing
- Small cross-lane unblock fixes when safe
- Environment/access/deploy/schema unblock coordination
- Moving tickets out of `Blocker` only after proof exists

**Blocker protocol:**
1. Read the blocked ticket, latest comments, and linked upstream/downstream tickets.
2. Classify the blocker: direct fix, dev-tech fix, UX fix, testing rerun, builder/access issue, or stale/superseded.
3. If the blocker is directly fixable and low risk, fix it and run proof.
4. If a specialist owns the fix, leave one concrete coordination comment with exact files/commands/proof required.
5. Keep the ticket in `Blocker` until proof lands.
6. After proof lands, move the ticket back to `In Progress`, `Review`, or `Done`, and route verification to `testing-agent` when needed.

**What this agent does NOT do:**
- Does not post sweep comments when no blocker state changed
- Does not steal normal feature work from specialist agents
- Does not mark blockers Done without code/test/probe proof
- Does not override `mvp-night-vibe-builder` on product priority

**Required comment format:**
```
AGENT: blocker-resolution-agent
STATUS: Blocker | In Progress | Unblocked | Done
PROOF: blocker evidence, file/command/test/probe result
NEXT: exact owner/action required next
```

---

## Shared Workflow Protocol

### How every session must start

1. **Any agent** reads `/Users/admin/jira-ticketing-mvp/app.js` to understand board state
2. **Any agent** reads this file (`AGENTS.md`) to confirm their role and scope
3. **Any agent** sets their assigned ticket to `In Progress` and leaves a comment: `AGENT: <name> | STARTING: <ticket-id> | PLAN: <one line of what they'll do>`
   - If the ticket cannot progress because of a concrete blocker, move it to `Blocker` and route it to `blocker-resolution-agent` with proof.
4. Work happens
5. **Any agent** leaves a `DONE` or `BLOCKED` comment before stopping

### How tickets flow

```
Orchestrator creates ticket → assigns to agent
    ↓
Agent picks up → moves to In Progress → leaves START comment
    ↓
If blocked → moves to Blocker → blocker-resolution-agent coordinates/fixes unblock path
    ↓
Agent finishes → leaves DONE comment with proof → moves to Done
    ↓
Orchestrator reads Done ticket → creates follow-up if needed
    ↓
testing-agent runs regression → confirms pass
```

### Bug flow (separate from feature flow)

```
testing-agent finds bug → creates [BUG] ticket → assigns to orchestrator
    ↓
Orchestrator reads bug → assigns to ux-ui-agent (UI) or dev-tech-agent (logic/API)
    ↓
Fixer agent picks up → leaves START comment → fixes → leaves DONE comment
    ↓
testing-agent re-runs tests → leaves VERIFIED comment → ticket closes
```

---

## Ticket Comment Format (all agents must use this)

```
AGENT: <agent-id>
STATUS: <Starting | In Progress | Done | Blocked>
PROOF: <commit SHA | test name | file path | "no change needed">
NEXT: <what happens next, or DONE>
```

Example:
```
AGENT: dev-tech-agent
STATUS: Done
PROOF: commit a3f9d21 — src/app/api/saved-spots/route.ts fixed null venue_name
NEXT: testing-agent to re-run E2E and confirm NV-009 regression is clear
```

---

## Ownership Map (quick reference)

| Area | Owner |
|---|---|
| API routes (`/src/app/api/`) | dev-tech-agent |
| AI scoring (`/src/lib/ai.ts`) | dev-tech-agent |
| Supabase schema + migrations | dev-tech-agent |
| OpenAI / Google Places integration | dev-tech-agent |
| UI components (`/src/components/`) | ux-ui-agent |
| Page layouts (`/src/app/*/page.tsx`) | ux-ui-agent |
| Tailwind config + CSS variables | ux-ui-agent |
| shadcn/ui primitives (`/src/components/ui/`) | ux-ui-agent + codex |
| E2E specs (`/e2e/`) | testing-agent |
| Unit tests (`/src/lib/__tests__/`) | testing-agent + dev-tech-agent |
| Bug reporting | testing-agent |
| Senior product UX review | senior-product-ux-agent + ux-ui-agent |
| Senior API/data architecture review | senior-full-stack-architect + dev-tech-agent |
| Senior release/go-no-go review | senior-qa-release-agent + testing-agent |
| 60-minute board sweeps + stale ticket escalation | senior-scrum-lead |
| Blocker column + unblock coordination | blocker-resolution-agent |
| Agent Board UI (`/jira-ticketing-mvp/`) | codex |
| Ticket assignments + sprint planning | mvp-night-vibe-builder (orchestrator) |
| `vercel.json` + deployment | mvp-night-vibe-builder |
| `supabase/config.toml` + migrations | dev-tech-agent |
| `AGENTS.md` (this file) | mvp-night-vibe-builder |

---

## Environment Reference

| Variable | Used by | Safe for client? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All agents | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All agents | ✅ Yes (anon only) |
| `SUPABASE_SERVICE_ROLE_KEY` | dev-tech-agent (server routes only) | ❌ Never |
| `OPENAI_API_KEY` | dev-tech-agent (server routes only) | ❌ Never |
| `GOOGLE_PLACES_API_KEY` | dev-tech-agent (server routes only) | ❌ Never |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ux-ui-agent (map component) | ✅ Yes |
| `NEXT_PUBLIC_ENV` | All agents | ✅ Yes (`development` shows amber banner) |
| `ADMIN_EMAILS` | dev-tech-agent (server routes only) | ❌ Never — comma-separated email allowlist for `/admin` |

**Dev Supabase:** `https://onlpwglwnqoivuykywrk.supabase.co` (account: dev@dashurl.site)
**Prod Supabase:** `https://gfsbqewkrcyclbktfyfk.supabase.co`
**Production URL:** `https://night-vibe-checker.vercel.app`
**GitHub repo:** `https://github.com/nytchkr/night-vibe-checker`
**Agent Board:** `/Users/admin/jira-ticketing-mvp/app.js`

---

## Quality Gates (all agents enforce these)

Before any commit:
- [ ] `npm run type-check` — zero TypeScript errors
- [ ] `npm test -- --run` — all 70 unit tests pass
- [ ] No new `console.error` or unhandled promise rejections introduced

Before any ticket moves to Done:
- [ ] Proof comment left on the ticket (commit SHA or test output)
- [ ] No regressions: 58 E2E must still pass (baseline)
- [ ] Related tickets updated if this work affects them

Before any production deploy:
- [ ] Full E2E suite passes: `CI=1 BASE_URL=http://localhost:3000 npx playwright test`
- [ ] `vercel deploy --prod` only after all gates pass
- [ ] NV-029 (deployment ticket) comment updated with new deployment URL

---

## Agent Conflict Resolution

If two agents are assigned overlapping work:
1. The agent whose **Ownership Map** row covers the file wins
2. If still unclear, orchestrator arbitrates via a comment on the ticket
3. Codex and ux-ui-agent share `/src/components/ui/` — Codex creates primitives, ux-ui-agent uses them
4. Never force-push to main. Create a branch and let orchestrator review.

---

## File Locations

| File | Purpose |
|---|---|
| `/Users/admin/night-vibe-checker/AGENTS.md` | This file — agent roles and protocol |
| `/Users/admin/jira-ticketing-mvp/app.js` | Live Agent Board — tickets, comments, agent registry |
| `/Users/admin/jira-ticketing-mvp/AGENT_SYNC_PROTOCOL.md` | Claude ↔ Codex sync protocol |
| `/Users/admin/night-vibe-checker/supabase/migrations/` | Database migrations (run on both dev + prod) |
| `/Users/admin/night-vibe-checker/.env.local` | Prod keys for local use (never commit) |
| `/Users/admin/night-vibe-checker/.env.development.local` | Dev Supabase keys (never commit) |
| `/Users/admin/night-vibe-checker/.github/workflows/ci.yml` | CI pipeline (type-check + unit + E2E) |

---

*Last updated: 2026-06-19 by mvp-night-vibe-builder*
*All agents: re-read this file at the start of every session.*

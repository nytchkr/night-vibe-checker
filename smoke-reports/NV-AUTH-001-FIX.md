# NV-AUTH-001 Fix Attempt

Status: Blocked
Date: 2026-06-22
Agent: dev-tech-agent

## Scope

Fix Google OAuth in Supabase production by pushing Google OAuth credentials to project `gfsbqewkrcyclbktfyfk`.

## Environment Check

- `GOOGLE_OAUTH_CLIENT_ID`: missing from `.env.local`
- `GOOGLE_OAUTH_CLIENT_SECRET`: missing from `.env.local`
- `SUPABASE_ACCESS_TOKEN`: missing from `.env.local`

Because the required OAuth values and Supabase access token are missing locally, `npx supabase secrets set` was not run.

## Supabase Config Check

`supabase/config.toml` contains:

- `[auth.external.google]`
- `enabled = true`
- `client_id = "env(GOOGLE_OAUTH_CLIENT_ID)"`
- `secret = "env(GOOGLE_OAUTH_CLIENT_SECRET)"`

## Production OAuth Probe

Command used:

```sh
curl -s -o /tmp/nv-auth-001-authorize-body.txt -w 'http_code=%{http_code}\nredirect_url=%{redirect_url}\n' 'https://gfsbqewkrcyclbktfyfk.supabase.co/auth/v1/authorize?provider=google'
```

Result:

```text
http_code=400
redirect_url=
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

## Verification

- `npm run type-check`: passed
- `npx vitest run src/app/auth/__tests__/callback.test.ts`: passed, 5 tests

## Next Action

Add the following values to `/Users/admin/night-vibe-checker/.env.local`, then rerun this dispatch:

- `SUPABASE_ACCESS_TOKEN`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

No key or token values should be committed, logged, or written to smoke reports.

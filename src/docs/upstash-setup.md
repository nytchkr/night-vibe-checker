# Upstash Setup for Azure Static Web Apps

Ticket: NV-INFRA-004

## Scope

Night Vibe Checker uses Upstash for production Redis-backed infrastructure. The Azure Static Web Apps production runtime must receive the Upstash values from Azure Application Settings. Do not commit these values to this repository, `.env` files, or GitHub workflow files.

The Azure Static Web Apps deployment workflow is:

- `.github/workflows/azure-static-web-apps-nytchkr-prod.yml`

That workflow should not contain the Upstash secrets. Keep the values in Azure Static Web Apps Application settings so they are available to the deployed app runtime.

## Required Upstash Resources

Redis database:

- Name: `nightvibe-prod`
- Region: `us-east-1`
- Console: `https://console.upstash.com/redis`

QStash:

- Console: `https://console.upstash.com/qstash`

## Required Environment Variables

Add these exact names in Azure Static Web Apps Application settings:

| Variable | Source in Upstash |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Console -> Redis -> `nightvibe-prod` -> REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console -> Redis -> `nightvibe-prod` -> REST Token |
| `QSTASH_TOKEN` | Upstash Console -> QStash -> Tokens -> Token |
| `QSTASH_CURRENT_SIGNING_KEY` | Upstash Console -> QStash -> Signing Keys -> Current signing key |
| `QSTASH_NEXT_SIGNING_KEY` | Upstash Console -> QStash -> Signing Keys -> Next signing key |

## Azure Static Web Apps Configuration

1. Open the Azure Portal.
2. Go to Static Web Apps.
3. Select the Night Vibe Checker production Static Web App.
4. Open Configuration.
5. Open Application settings.
6. Add each required Upstash variable with its value from the Upstash console.
7. Save the configuration.
8. Restart or redeploy the Static Web App if Azure does not automatically refresh runtime settings.

## Security Rules

- Never commit real Upstash Redis or QStash values.
- Never add these secrets to `.github/workflows/azure-static-web-apps-nytchkr-prod.yml`.
- Never prefix these names with `NEXT_PUBLIC_`; they are server/runtime secrets.
- Keep local placeholders in example env files only.

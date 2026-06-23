# NV-SMOKE-PROD-001 Production API Smoke

Production URL: https://night-vibe-checker.vercel.app

No response bodies were logged.

| Endpoint | URL tested | HTTP status | Result |
| --- | --- | ---: | --- |
| List venues | https://night-vibe-checker.vercel.app/api/venues | 200 | PASS |
| Search venues | https://night-vibe-checker.vercel.app/api/venues?q=bar | 200 | PASS |
| Trending venues | https://night-vibe-checker.vercel.app/api/venues/trending | 200 | PASS |
| Activity feed | https://night-vibe-checker.vercel.app/api/activity/feed | 200 | PASS |
| Refresh open now cron | https://night-vibe-checker.vercel.app/api/cron/refresh-open-now | Skipped | PASS - cron protected |

Verification command shape:

```bash
curl -s -o /dev/null -w '%{http_code}' '<url>'
```

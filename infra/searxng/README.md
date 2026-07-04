# SearXNG For Vultr-Audit

Self-hosted free web search for the backend `web_search` tool.

## Local Run

```bash
cd infra/searxng
copy .env.example .env
docker compose up -d
```

Before starting, set a real secret in `.env`:

```bash
openssl rand -hex 32
```

Put that value in:

```env
SEARXNG_SECRET_KEY=...
```

Verify JSON output:

```bash
curl "http://localhost:8080/search?q=AAPL%208-K%20debt&format=json"
```

Then configure the backend root `.env`:

```env
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=http://localhost:8080
```

Restart `pibackend`, then test:

```bash
curl -X POST http://localhost:8001/api/tools/web-search ^
  -H "Content-Type: application/json" ^
  -d "{\"query\":\"AAPL recent 8-K new debt\",\"maxResults\":3}"
```

## Vultr Deploy Notes

By default, Compose binds to `127.0.0.1:8080`, which is appropriate when `pibackend` runs on the same machine.

If SearXNG must be reachable from another server, prefer putting it behind Caddy/Nginx with HTTPS and Basic Auth. SearXNG has no built-in authentication, so do not expose it publicly without protection.

For Dokploy, add these environment variables in the app settings instead of committing secrets:

```env
SEARXNG_PORT=8080
SEARXNG_PUBLIC_URL=https://search.your-domain.com/
SEARXNG_INSTANCE_NAME=Vultr Audit Search
SEARXNG_SECRET_KEY=<generated secret>
```

`settings.yml` is generated at container startup from `settings.template.yml`, so the secret does not need to be stored in git.

For a public reverse proxy, also update:

```env
SEARXNG_PUBLIC_URL=https://search.your-domain.com/
```

## JSON API Requirement

`settings.template.yml` already includes:

```yaml
search:
  formats:
    - html
    - json
```

Without `json` in `search.formats`, SearXNG will reject `format=json` requests.

# Vultr-Audit Backend

Minimal TypeScript/Bun backend for the Vultr-Audit pivot.

This folder now keeps only the reusable backend reference points needed by the root README plan:

- Elysia HTTP server and CORS setup.
- Drizzle + SQLite for tool state and local reference data.
- Root `.env` loading.
- Vultr OpenAI-compatible chat client.
- SEC company ticker sync from `https://www.sec.gov/files/company_tickers.json`.
- SEC filing lookup placeholder.
- Vultron retrieval placeholder.
- Covenant calculation tool.
- AgentEngine skeleton for Plan -> Retrieve -> Calculate -> Report.

```bash
cd pibackend
bun install
bun run dev
```

The API defaults to `http://localhost:8001`. Point the frontend at it with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8001
```

Useful endpoints:

- `GET /api/health`
- `GET /api/runtime`
- `POST /api/audits/run`
- `GET /api/sec/tickers/search?q=apple`
- `GET /api/sec/tickers/AAPL`
- `POST /api/sec/tickers/sync`

Ticker cache:

```bash
bun run db:sync-tickers
```

The SEC ticker cache is stored in `pibackend/vultr_audit.db` unless `DATABASE_PATH` is set. The agent uses this cache as its first lookup step to normalize ticker input to SEC CIK/company metadata before planning filing retrieval.

The service reads the root `.env` file for Vultr settings. When `VULTR_API_KEY` is set and `VULTR_DEMO_MODE` is not true, reasoning calls use the configured Vultr inference endpoint. Without a live key, deterministic placeholders keep the backend usable during local development.

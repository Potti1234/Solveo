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
- `execute_code` tool for Python/TypeScript analyst scripts.
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
- `GET /api/tools/definitions`
- `POST /api/tools/execute-code`
- `POST /api/tools/web-search`
- `GET /api/sec/tickers/search?q=apple`
- `GET /api/sec/tickers/AAPL`
- `GET /api/sec/filings/AAPL/exhibits/10-1`
- `POST /api/sec/tickers/sync`

Ticker cache:

```bash
bun run db:sync-tickers
bun run sec:discover-exhibits AAPL
```

The SEC ticker cache is stored in `pibackend/vultr_audit.db` unless `DATABASE_PATH` is set. The agent uses this cache as its first lookup step to normalize ticker input to SEC CIK/company metadata before planning filing retrieval.

SEC requests include `SEC_USER_AGENT`. Set it to a real project/contact string before production use.

Code execution:

```bash
curl -X POST http://localhost:8001/api/tools/execute-code \
  -H "Content-Type: application/json" \
  -d "{\"language\":\"python\",\"code\":\"print(3.2 < 3.5)\"}"
```

The local executor is intended for hackathon development. For production, replace `src/tools/executeCode.ts`
with an E2B or Docker-backed executor while keeping the same tool contract.

Web search:

The free-first provider is SearXNG. Run or deploy a SearXNG instance with JSON output enabled, then set:

```bash
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=http://localhost:8080
```

For a hosted fallback, set `WEB_SEARCH_PROVIDER=brave` and `BRAVE_SEARCH_API_KEY`.

Agent covenant discovery flow:

1. Resolve ticker to SEC CIK/company metadata.
2. Fetch submission history from `https://data.sec.gov/submissions/CIK##########.json`.
3. Inspect recent `10-K` and `8-K` filing directories for Exhibit 10.1 candidates.
4. Scan the selected agreement with VultronRetrieverFlash keywords:
   `Financial Covenants`, `Consolidated Leverage Ratio`, `Fixed Charge Coverage Ratio`,
   `Negative Covenants`, `Compliance Certificate`, and `Form of Compliance Certificate`.
5. Pass the relevant context to VultronRetrieverPrime-style rule extraction.
6. Write and run a Python script to verify the covenant math.
7. Write and run a second Python script to project breach risk over the next two quarters.

Both scripts are returned in `thoughts` with phase `code_execution`, so the frontend can show the code block and execution output in the agent trace.

The service reads the root `.env` file for Vultr settings. When `VULTR_API_KEY` is set and `VULTR_DEMO_MODE` is not true, reasoning calls use the configured Vultr inference endpoint. Without a live key, deterministic placeholders keep the backend usable during local development.

# Vultr-Audit Backend

Minimal TypeScript/Bun backend for the Vultr-Audit pivot.

This folder now keeps only the reusable backend reference points needed by the root README plan:

- Elysia HTTP server and CORS setup.
- Drizzle + SQLite for tool state and local reference data.
- Root `.env` loading.
- Vultr OpenAI-compatible chat client.
- SEC company ticker sync from `https://www.sec.gov/files/company_tickers.json`.
- SEC filing lookup and submission-history discovery.
- Vultr-first document extraction using focused agreement/filing windows, Vector Store retrieval, and RAG normalization, with deterministic local parsing as an offline fallback.
- Covenant calculation tool.
- `execute_code` tool for Python/TypeScript analyst scripts.
- AgentEngine skeleton for Plan -> Retrieve -> Calculate -> Report.
- Credit monitoring expansion for recent 8-K events, covenant headroom trend, amendment checks, early-warning scoring, and schedule recommendations.

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
- `POST /api/audits/report`
- `GET /api/tools/definitions`
- `POST /api/tools/execute-code`
- `POST /api/tools/web-search`
- `POST /api/what-if/run`
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

A ready-to-run Docker Compose setup is available in `infra/searxng`.

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

Vultr integration:

- Chat reasoning uses the OpenAI-compatible `/chat/completions` endpoint.
- Document retrieval uses Vultr Vector Store: create collection, add chunked SEC document items, search the collection, and use RAG chat for normalization.
- Covenant and financial line-item extraction first ask Vultr for strict JSON from focused document windows; deterministic parsers are fallback/verification paths, not the primary product path.
- Optional `ENABLE_VECTOR_INDEXING`, `ENABLE_DIRECT_LLM_EXTRACTION`, `ENABLE_SLOW_COVENANT_RAG`, and `ENABLE_COVENANT_REFINEMENT` enable additional remote extraction passes for experiments or background pre-warming, but they are disabled by default to keep UI runs responsive.
- Indexed document collection IDs are cached in SQLite by document URL.

Triple-Check & Act:

- Reflective retrieval searches `Subsequent Events` and management liquidity/debt language after the first calculation.
- If a covenant is failing or within 10% of its limit, the agent calls `web_search` for recent 8-K, debt, refinancing, or covenant context.
- The response includes `actionPlan` with a credit-officer summary, pre-filled borrower email, three borrower questions, and dashboard chart configuration.
- The response also includes `creditMonitoring` with material event signals, headroom trend, amendment comparison, early-warning score, and proposed background jobs such as weekly rescans or 15-minute web/news scans for high-risk cases.

Explainability report:

```bash
bun run audit:report MCK
```

The audit response includes `explainability`, a presentation-friendly trace with documents used, tool calls, evidence trail, calculation trail, code verification, decision trail, and caveats. `POST /api/audits/report` also returns a Markdown report for display or export.

What-If Console:

```bash
curl -X POST http://localhost:8001/api/what-if/run \
  -H "Content-Type: application/json" \
  -d "{\"ticker\":\"AAPL\",\"question\":\"What if interest rates rise by another 1.5% next month?\",\"baselineRatio\":3.2,\"threshold\":3.5}"
```

The endpoint writes and executes a Python stress script, returning the code, assumptions, and result.

The service reads the root `.env` file for Vultr settings. When `VULTR_API_KEY` is set and `VULTR_LOCAL_MODE` is not true, reasoning and document retrieval use the configured Vultr inference endpoint. Without a live key, deterministic local extraction keeps the backend usable during development.

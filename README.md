# Solveo

**Live demo:** https://solveo.lukaspottner.com

Solveo is an agentic SEC filing research and credit-risk monitoring workspace for banks, credit teams, and traders. It helps users analyze public company filings, credit agreements, covenant disclosures, revenue trends, market-entry signals, and external web context through a tool-using agent rather than a manual document hunt.

Think of it as **Claude Code for SEC data**: the agent can read filings, plan an investigation, retrieve evidence, search the web for relevant context, run custom code to parse or verify numbers, and return an explainable report with citations and tool traces.

## Use Case

Banks and lenders can use Solveo to monitor borrower credit risk more efficiently. A credit analyst can ask the agent to review a company, inspect recent SEC filings, identify covenant or liquidity concerns, compare evidence across reports, and produce follow-up questions or monitoring recommendations. The goal is not just to answer one question, but to create a repeatable workflow for ongoing credit surveillance.

Traders and public-market analysts can use Solveo to analyze SEC filings faster and with more structure. Instead of manually scanning 10-Ks, 10-Qs, and 8-Ks, they can ask targeted questions about revenue trends, segment performance, new market entry plans, product launches, risk factors, debt, liquidity, or management commentary. The agent retrieves filing evidence and can supplement it with web search when outside context is useful.

Solveo is especially useful when the question needs more than one LLM call:

- Find the right company and SEC identifier.
- Select relevant filings.
- Retrieve specific excerpts from long filings.
- Compare facts across documents.
- Run code to normalize or verify numbers.
- Use web search to find recent external context.
- Return a report that shows what was used and why.

## What It Does

Solveo supports two major research modes.

**Credit-risk and covenant review**

- Resolves a borrower to SEC ticker, CIK, and company metadata.
- Finds recent SEC filings and credit-agreement exhibits.
- Searches filings for debt, EBITDA, liquidity, covenant, and risk disclosures.
- Extracts evidence-backed line items and covenant context.
- Runs calculation and stress-test scripts through the code execution tool.
- Produces an audit-style report with documents, tool calls, evidence, calculations, caveats, and recommended next steps.

**General SEC filing research**

- Answers natural-language filing questions such as revenue trends, product plans, new market-entry signals, or risk-factor changes.
- Plans which filing types to inspect, such as 10-K, 10-Q, or 8-K.
- Retrieves relevant excerpts from SEC documents.
- Synthesizes the answer from filing evidence.
- Preserves citations and an explainability trail so the user can inspect the source material.

## Architecture

Solveo is a full-stack application built around a bounded agent workflow.

```text
Browser UI
   |
   | HTTPS
   v
Frontend container
React + Vite + Nginx
   |
   | /api reverse proxy
   v
Backend container
Bun + TypeScript + Elysia
   |
   |-- SEC data APIs
   |-- Vultr Serverless Inference
   |-- Vultr retrieval/reranking
   |-- SQLite state/cache
   |-- Web search provider, usually SearXNG
   |-- Code execution tool for custom parsing and verification
```

The frontend is a chat-led analysis workspace. Users ask questions in natural language and inspect the agent's work through streamed steps, citations, reports, and tool outputs.

The backend owns the actual agent orchestration. It does not simply forward a prompt to a model. It breaks the work into explicit phases, calls deterministic services where possible, uses LLM calls inside bounded planning or synthesis steps, and returns a structured paper trail.

SQLite is used for local backend state and SEC metadata caches. In production Docker deployments, the database is stored in a persistent Docker volume.

## Main Components

**Frontend**

- Located in `frontend/`.
- Built with React, Vite, TypeScript, and shadcn-style UI components.
- Served in production by Nginx.
- Calls `/api/...` on the same deployed domain, so no public backend port is required.

**Backend**

- Located in `pibackend/`.
- Built with Bun, TypeScript, and Elysia.
- Provides SEC research, audit, tool, what-if, and runtime endpoints.
- Uses SQLite through Drizzle/Bun SQLite for persistent local state.
- Exposes health and runtime checks at `/api/health` and `/api/runtime`.

**SEC services**

- Resolve ticker symbols and company names to SEC CIK metadata.
- Fetch SEC submission history from `data.sec.gov`.
- Find recent 10-K, 10-Q, and 8-K filings.
- Discover Exhibit 10.1 credit agreements when covenant analysis needs the underlying contract.

**Vultr inference and retrieval**

- Uses Vultr Serverless Inference for planning, extraction, answer synthesis, and structured JSON tasks.
- Uses Vultr retriever/reranker models to identify relevant excerpts in long SEC documents.
- Falls back to deterministic local behavior when live model configuration is unavailable, which keeps local development usable.

**Web search**

- Integrates with a web search provider, typically SearXNG.
- Used when the agent needs recent external context, market news, refinancing context, litigation mentions, or other information outside the SEC filing itself.
- In production, `SEARXNG_BASE_URL` should point at an existing SearXNG deployment.

**Code execution tool**

- Runs bounded Python or TypeScript snippets for custom parsing, calculations, stress tests, or verification.
- Useful for analyst-style work where the agent needs to transform tables, validate covenant math, or test scenarios instead of only summarizing text.

## Agent Workflow

Solveo's agent workflow is intentionally structured and inspectable.

1. **Intent detection**

   The backend classifies the user request. A covenant or credit-agreement question routes into the credit audit workflow. A broader filing question routes into the general SEC research workflow.

2. **Company resolution**

   The agent resolves the input company name or ticker to SEC metadata. This gives the workflow a ticker, CIK, company name, and reliable SEC document paths.

3. **Research planning**

   The agent chooses which filing types and retrieval queries are relevant. For example, a revenue question may focus on 10-K and 10-Q filings, while a material event question may include 8-Ks.

4. **Document discovery**

   The backend fetches recent SEC filings and selects documents to inspect. For credit workflows, it can also search filing directories for credit agreements and Exhibit 10.1 documents.

5. **Retrieval**

   The agent searches selected filings for relevant excerpts. Retrieval queries are tied to the user question, such as revenue by segment, liquidity, debt maturities, risk factors, product announcements, or covenant language.

6. **Evidence extraction**

   Retrieved text is normalized into citations, line items, and evidence blocks. The workflow keeps source URLs, filing dates, locators, and excerpts so the result can be checked.

7. **Tool use**

   When needed, the agent calls tools:

   - `sec.resolve_ticker` for SEC metadata.
   - `vultr.retriever.*` for filing retrieval.
   - `web_search` for external context.
   - `execute_code` for custom parsing, calculations, and verification.
   - `what_if` for scenario analysis.

8. **Calculation and verification**

   For credit workflows, the agent can compute covenant ratios, verify calculations with generated scripts, and stress assumptions over future periods.

9. **Reflective checks**

   The agent can perform follow-up retrieval against liquidity language, subsequent events, recent 8-Ks, amendments, or external news to check whether the first answer missed important risk context.

10. **Synthesis**

   The agent writes a final answer using only the collected evidence. For general SEC research, this becomes a filing-backed narrative. For credit review, it becomes a risk memo and monitoring summary.

11. **Explainability report**

   Every run returns a structured report containing:

   - Documents used.
   - Tools called.
   - Evidence trail.
   - Calculation trail.
   - Code verification output.
   - Decision summary.
   - Caveats and follow-up recommendations.

## Example Questions

```text
Analyze Apple's SEC reports from the last two years and identify interesting revenue trends and possible new market-entry plans.
```

```text
Review McKesson's latest filing and credit agreement for covenant risk. Show the calculation and cite the source evidence.
```

```text
Look at recent 8-Ks for this borrower and tell me whether there are signs of refinancing, liquidity pressure, or covenant amendments.
```

```text
Compare segment revenue trends over the last two filings and run a small script to calculate year-over-year changes.
```

## API Endpoints

Default local backend URL:

```text
http://localhost:8001
```

Useful endpoints:

- `GET /api/health`
- `GET /api/runtime`
- `POST /api/audits/report`
- `POST /api/audits/report/stream`
- `POST /api/audits/intent`
- `POST /api/tools/execute-code`
- `POST /api/tools/web-search`
- `POST /api/what-if/run`
- `GET /api/sec/tickers/search?q=apple`
- `GET /api/sec/tickers/:ticker`
- `GET /api/sec/filings/:ticker/exhibits/10-1`
- `POST /api/sec/tickers/sync`

Check live model status:

```text
https://solveo.lukaspottner.com/api/runtime
```

When the live model is configured, `mode` should be `vultr-live`.

## Local Development

Install and run the backend:

```bash
cd pibackend
bun install
bun run dev
```

Install and run the frontend:

```bash
cd frontend
bun install
bun run dev
```

The frontend defaults to:

```text
http://localhost:3000
```

The backend defaults to:

```text
http://localhost:8001
```

## Environment

Create a root `.env` for local development or configure these variables in Dokploy for production:

```env
VULTR_API_KEY=your_vultr_key
VULTR_INFERENCE_URL=https://api.vultrinference.com/v1
VULTR_REASONING_MODEL=deepseek-ai/DeepSeek-V4-Flash
VULTR_RETRIEVER_MODEL=vultr/VultronRetrieverPrime-Qwen3.5-8B
VULTR_RETRIEVER_PRIME_MODEL=vultr/VultronRetrieverPrime-Qwen3.5-8B
VULTR_RETRIEVER_CORE_MODEL=vultr/VultronRetrieverCore-Qwen3.5-4.5B
VULTR_RETRIEVER_FLASH_MODEL=vultr/VultronRetrieverFlash-Qwen3.5-0.8B
VULTR_LOCAL_MODE=false
VULTR_TIMEOUT_SECONDS=30000

SEC_API_KEY=your_sec_api_key
SEC_USER_AGENT=Solveo (your-email@example.com)

WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=https://your-existing-searxng-domain.example

CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
VITE_API_URL=http://localhost:8001
```

For production behind the included Nginx frontend container, `VITE_API_URL` can be empty so the browser calls `/api/...` on the same domain.

## Deployment

The project includes a Dokploy-friendly Compose setup:

```text
docker-compose.yml
```

The Compose deployment runs:

- `frontend`: React/Vite static build served by Nginx.
- `backend`: Bun/Elysia API server.

SearXNG is expected to be deployed separately. Set:

```env
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=https://your-existing-searxng-domain.example
```

In Dokploy, route your domain to:

```text
service: frontend
port: 80
```

The frontend container proxies `/api` requests to the backend container internally. No public backend port is required.

## Current Limitations

- The product is designed to assist analysis, not replace professional credit, legal, or investment judgment.
- SEC filings can be long and inconsistently formatted, so extraction quality depends on source document structure and model availability.
- When live Vultr configuration is missing or unavailable, the backend can fall back to deterministic local behavior. This is useful for development but produces less complete narrative synthesis.
- Scheduled background monitoring is currently represented through recommendations and workflow outputs; a durable worker/notification system can be added on top.
- PDF and scanned document upload support is not the primary path yet; the strongest flow is SEC HTML filing retrieval.

## Why It Matters

Credit analysts and traders spend significant time searching through filings, extracting tables, checking evidence, and turning documents into decisions. Solveo compresses that workflow into an inspectable agent run. It does not hide the work behind a black-box answer: it shows documents, searches, code, calculations, citations, and caveats.

That makes it useful for bank credit monitoring, covenant review, SEC filing analysis, and public-market research where speed matters but traceability still matters more.

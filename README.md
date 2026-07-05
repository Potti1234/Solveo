# Vultr-Audit

Agentic financial compliance monitor for lender loan-covenant review.

Vultr-Audit checks a borrower against credit-agreement covenants by combining SEC filings, Exhibit 10.1 credit agreements, Vultr Serverless Inference, Vultr Vector Store retrieval, deterministic financial calculations, code-execution verification, and an audit-ready explainability report.

## Current Scope

The current repo is backend-first. The frontend is intentionally deferred until the backend workflow is reliable.

Implemented:

- SEC ticker cache in SQLite from `company_tickers.json`.
- SEC submissions lookup from `data.sec.gov/submissions/CIK##########.json`.
- Exhibit 10.1 discovery from recent 8-K / 10-K filing directories.
- Vultr OpenAI-compatible chat client.
- Vultr Vector Store document indexing and semantic retrieval.
- Covenant keyword scan for credit agreements.
- SEC filing retrieval for debt and EBITDA inputs.
- Covenant ratio calculator.
- Python/TypeScript `execute_code` tool.
- Two script-backed checks: math verification and two-quarter stress projection.
- Self-check retrieval for subsequent events and liquidity/debt discussion.
- Optional SearXNG web search for live external context.
- Explainability report with documents, tool calls, evidence trail, calculation trail, code verification, decision trail, and caveats.
- Credit monitoring expansion with recent 8-K material-event scan, covenant headroom trend, credit-agreement amendment comparison, early-warning score, and background schedule recommendations.

## Verified Run Target

One known working end-to-end run is:

```text
Ticker: MCK
Company: McKesson Corp
Credit agreement: Exhibit 10.1 term loan agreement
SEC filing: latest available 10-Q
```

Use the real credit agreement URL as input. The backend extracts the covenant threshold and financial values from the linked SEC documents at run time.

CLI:

```bash
cd pibackend
bun install
bun run db:sync-tickers
bun run audit:report MCK https://www.sec.gov/Archives/edgar/data/927653/000092765326000167/mck_ex101termloanagreement.htm
```

API:

```bash
curl -X POST http://localhost:8001/api/audits/report \
  -H "Content-Type: application/json" \
  -d '{"ticker":"MCK","creditAgreementUrl":"https://www.sec.gov/Archives/edgar/data/927653/000092765326000167/mck_ex101termloanagreement.htm"}'
```

## Backend

```bash
cd pibackend
bun run dev
```

Default API URL:

```text
http://localhost:8001
```

Key endpoints:

- `GET /api/health`
- `GET /api/runtime`
- `POST /api/audits/run`
- `POST /api/audits/report`
- `POST /api/tools/execute-code`
- `POST /api/tools/web-search`
- `POST /api/what-if/run`
- `GET /api/sec/tickers/:ticker`
- `GET /api/sec/filings/:ticker/exhibits/10-1`

## Architecture

This is a structured agentic workflow rather than a free-form chatbot.

The backend controls the audit sequence:

1. Resolve SEC ticker and CIK.
2. Discover a credit agreement exhibit.
3. Scan covenant keywords in the agreement.
4. Extract or select a covenant rulebook.
5. Plan SEC filing retrieval.
6. Retrieve financial evidence with Vultr Vector Store.
7. Extract line items and compute covenant ratios.
8. Run Python scripts to verify math and project stress risk.
9. Perform reflective retrieval for contradictory evidence.
10. Scan recent 8-Ks for credit-relevant events.
11. Estimate covenant headroom trend across recent filings when enough data can be extracted.
12. Compare recent credit agreement amendments when prior agreements are available.
13. Recommend follow-up schedules for rescans, 8-K checks, amendment checks, or high-frequency news monitoring.
14. Produce action plan and explainability report.

The LLM participates inside bounded steps for extraction and planning. Tools are explicit and auditable.

## Background Agent Format

The backend does not run long-lived scheduled jobs yet. Instead, each audit returns `creditMonitoring.scheduleRecommendations` as structured job proposals:

```json
{
  "kind": "web_news_scan",
  "cadenceMinutes": 15,
  "runAt": "2026-07-05T12:15:00.000Z",
  "reason": "High-risk credit signal warrants frequent external news monitoring.",
  "input": {
    "query": "MCK debt refinancing covenant default liquidity credit agreement"
  }
}
```

The UI or a worker process can persist these recommendations, execute them later, and attach Telegram/email notification rules.

## Environment

Create a root `.env`:

```env
VULTR_API_KEY=your_vultr_key
VULTR_INFERENCE_URL=https://api.vultrinference.com/v1
VULTR_REASONING_MODEL=VultronRetrieverPrime-Qwen3.5-8B
VULTR_RETRIEVER_MODEL=VultronRetriever
VULTR_LOCAL_MODE=false
SEC_USER_AGENT=MyHackathonProject (email@example.com)
DATABASE_PATH=
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=https://your-searxng-domain.example
```

## SearXNG

Self-hosted search deployment lives in:

```text
infra/searxng
```

Use Dokploy or Docker Compose and point the backend at `SEARXNG_BASE_URL`.

## Judge-Relevant Strengths

- Finance-native workflow for covenant monitoring.
- Multi-step retrieval and reasoning, not a single chat call.
- Live SEC data path.
- Live Vultr Vector Store retrieval.
- Script-backed math verification.
- Early-warning monitoring beyond one covenant calculation.
- Explicit schedule recommendations for background agents.
- Explainable output suitable for credit officers.

## Known Backend Limitations

- Credit-agreement threshold extraction currently handles common leverage and coverage clauses such as `greater than 5.00 to 1.00` and `less than 2.50 to 1.00`. More covenant forms will need additional parsers.
- SEC HTML table extraction is deterministic and tuned for common 10-Q layouts. More issuers will need additional parsing rules.
- Background schedules are currently recommendations returned by the API; durable workers and notifications are not implemented yet.
- PDF/scanned-document upload is not implemented yet.
- Frontend is not implemented yet.

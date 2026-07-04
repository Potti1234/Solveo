# Solveo

Solveo is an agentic guest-relations and complaint-resolution platform for hotels and short-term rentals. The current demo focuses on policy-bound complaint adjudication: complaints from email, SMS, reviews, front desk notes, WhatsApp, and voicemail land in one inbox, then an AI agent investigates the claim, checks supporting evidence, adjudicates the case, drafts the response, creates follow-up work, and appends a cited decision to an operations board.

The broader product goal is to reduce front-desk workload while keeping hotel staff in control of sensitive, unresolved, or low-confidence guest conversations. Solveo is designed to support routine guest messaging through familiar channels such as WhatsApp and Telegram, voice-note handling, staff oversight, and hotel-specific knowledge retrieval.

## What Solveo Handles

## What Solveo Handles

- Unified guest complaint inbox across email, SMS, reviews, front desk notes, WhatsApp, and voicemail
- Explicit investigation traces with planning, tool calls, evidence retrieval, adjudication, and actions
- Booking, maintenance, policy, guest-history, and attachment evidence
- Image verification through Vultr vision when configured, with caption sidecars for deterministic demos
- Policy-bound compensation decisions with citations
- Draft guest responses, generated tickets, operations-board decisions, and pattern alerts
- Deterministic local demo fallbacks when live provider keys are not configured

> **Note:** This README contains both the product vision and current implementation details. The repository structure section below describes a proposed ideal architecture, but the actual codebase may differ. **Developers should add features to the current code structure without worrying about matching the proposed layout**—the README will be updated as the architecture evolves.

## Product Goal

## Setup

1. Install [Bun](https://bun.sh/) and Node.js 20+.
2. Copy `.env.example` to `.env` and add Vultr or Gradium keys if you have them.
3. Run `npm run install:all`.
4. Run `npm run dev`.
5. Open the URL printed by Next, normally `http://localhost:3000`.

`npm run dev` starts both local development servers with hot reload:

- Pi backend: `http://localhost:8001` via `bun --watch`
- Next frontend: `http://localhost:3000` via `next dev`, or the next available port if 3000 is already in use

The frontend defaults to `http://localhost:8001`. Override it with `NEXT_PUBLIC_API_URL` if you want to point at another backend.

Run `make test` for the Python backend smoke tests.

Docker alternative:

```bash
docker compose up
```

TypeScript Pi backend only:

```bash
cd pibackend
bun install
bun run dev
```

Then point the frontend at `http://localhost:8001` with `NEXT_PUBLIC_API_URL=http://localhost:8001`. This second backend uses Elysia endpoints, Drizzle with SQLite, Pi-compatible tool wrappers, and the existing seed data.

If Vultr keys are not present, the single LLM client in `backend/app/services/llm.py` uses deterministic demo fallbacks. If Gradium is not configured, voicemail upload and text-to-speech controls are hidden.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `VULTR_API_KEY` | For live LLM/retrieval | API key for Vultr Serverless Inference. |
| `VULTR_BASE_URL` | For live LLM/retrieval | OpenAI-compatible Vultr endpoint. Defaults to `https://api.vultrinference.com/v1`. |
| `VULTR_CHAT_MODEL` | For live LLM | Chat model for planning, adjudication, and responses. |
| `VULTR_RETRIEVER_MODEL` | For live retrieval | VultronRetriever model for `/rerank` policy retrieval. Defaults to `vultr/VultronRetrieverFlash-Qwen3.5-0.8B`. |
| `VULTR_DEMO_MODE` | No | Set `true` to force deterministic local demo mode. |
| `RETRIEVER_MODE` | No | `vultr` by default; use `fallback` for BM25 policy retrieval. |
| `GRADIUM_API_KEY` | For voice | Enables STT voicemail intake and TTS playback. |
| `GRADIUM_BASE_URL` | For voice | Gradium REST API base URL. Defaults to `https://api.gradium.ai/api`. |
| `GRADIUM_STT_MODEL` | For voice | Gradium speech-to-text model. Defaults to `default`. |
| `GRADIUM_TTS_VOICE_ID` | For voice | Gradium voice ID used for response playback. |
| `GRADIUM_TTS_FORMAT` | For voice | Gradium TTS audio format. Defaults to `wav`. |
| `DATABASE_PATH` | No | SQLite path. Defaults to the bundled local database under `backend/`. |
| `NEXT_PUBLIC_API_URL` | Yes | Frontend URL for the FastAPI backend. |

## Demo Script

1. Open the inbox. The two hero messages are pinned with a `Hero` badge.
2. Click `AC broken all night, demand full refund`.
3. Watch the trace populate: plan, booking lookup, maintenance retrieval, policy search, guest history, compensation calculation, adjudication, and actions.
4. Confirm the decision is `legitimate`, confidence is high, compensation is `$216.00`, and policy section `4.2` is cited.
5. Return to the inbox and click `Review: mold and filth in bathroom`.
6. Confirm the vision step uses the caption stub if no Vultr vision model is configured, identifies a dry water stain, cites same-day cleaning records and serial-refund escalation policy, declines compensation, and escalates.
7. Open Ops. The floor-3 HVAC pattern alert appears from the maintenance log, and completed case decisions are ranked by severity.

## Architecture

- Frontend: Next.js 14 App Router, TypeScript, Tailwind, lucide icons.
- Backend: FastAPI, SQLite, typed tools, explicit agent stages.
- Retrieval: `Retriever` interface with VultronRetriever rerank on Vultr Serverless Inference by default and BM25 fallback.
- Voice: Gradium STT/TTS REST routes, hidden in the UI unless `GRADIUM_API_KEY` is set.
- State: SQLite tables for inbox, cases, trace events, generated tickets, ops decisions, and alerts.

Agent stages are intentionally separate:

1. `planner.py` creates a JSON investigation plan.
2. `investigator.py` executes typed tools and can add an operations-policy hop when a cluster appears.
3. `vision.py` checks attachments through Vultr vision or caption sidecars.
4. `adjudicator.py` emits strict JSON with verdict, confidence, reasoning, compensation, escalation, and citations.
5. `actions.py` drafts the response, creates tickets, and updates the ops board.

## Repository Layout

```text
Solveo/
  README.md
  Makefile
  docker-compose.yml
  .env.example

  backend/
    app/
      agent/        # Planning, investigation, adjudication, actions, and runner
      retrieval/    # VultronRetriever rerank retrieval and BM25 fallback
      routes/       # FastAPI routes for inbox, cases, ops, and voice
      services/     # LLM client and provider integrations
      tools/        # Booking, policy, maintenance, vision, guest-history, compensation tools
    tests/          # Backend smoke tests

  frontend/
    app/            # Next.js app routes and dashboard screens
    components/     # Case, citation, decision, and channel UI components
    lib/            # API client helpers

  seed/
    inbox/          # Demo inbox messages
    images/         # Demo evidence images and caption sidecars
    policies/       # Compensation, evidence, escalation, and operations policies
```

## Product Direction

Solveo's current implementation centers on complaint resolution. The larger product direction keeps the original hotel support-agent vision:

- Answer common guest questions using hotel-specific knowledge
- Support text and voice-note interactions
- Work through familiar channels such as WhatsApp and Telegram
- Let hotel staff review conversations, escalations, and unresolved issues in one dashboard
- Highlight repeated topics, evidence gaps, and operations patterns
- Make it easy for hotels to update policies, amenities, and knowledge-base content

Future channel and product expansion can include a website chat widget, email ingestion, Instagram direct messages, staff takeover, conversation assignment, knowledge-base management, analytics, and a public landing page for hotel demo requests.

## Development Principles

- Keep guest messaging reliable before adding advanced automation.
- Store complete conversation history and case evidence for auditability.
- Make AI decisions and tool calls visible to hotel staff.
- Escalate uncertain or sensitive cases instead of forcing an answer.
- Keep channel integrations behind a shared interface.
- Treat each hotel as a separate workspace with isolated data.

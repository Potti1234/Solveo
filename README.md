Vultr-Audit: Agentic Financial Compliance Monitor 🛡️📉
📌 Project Overview
Vultr-Audit is an Enterprise Agentic workflow designed for the Finance track of the RAISE Hackathon. It automates the high-stakes task of Loan Covenant Monitoring.
In the real world, banks provide loans to corporations based on "Covenants" (legal rules found in 200-page Credit Agreements). Analysts must manually verify these rules against quarterly SEC filings (10-Qs). Vultr-Audit uses the layout-aware VultronRetriever to extract financial data from complex tables and legal clauses, performs multi-step reasoning to check for breaches, and generates an audit-ready compliance report.
🚀 The "Vultr" Advantage
VultronRetriever: Essential for reading the nested tables and financial statements in SEC filings where standard text-based RAG fails.
Serverless Inference: Powers the "Planner" and "Reviewer" agents using high-performance Qwen-3.5 models.
Infrastructure: Designed to be deployed on Vultr Bare Metal/Instances for low-latency financial data processing.
🛠️ Tech Stack
Frontend: React, Vite, TypeScript, Shadcn UI, Tailwind CSS.
State Management & Routing: TanStack Router, TanStack Query (React Query).
Backend: Node.js, TypeScript, Express/Fastify.
AI Engine: Vultr Serverless Inference (Qwen 3.5 8B/4.5B).
Retrieval: VultronRetriever (via Vultr API).
Data Sources: SEC EDGAR API (via SEC-API.io or direct RSS), Public Credit Agreements (Exhibit 10.1).
🧠 Agentic Workflow (Specification for AI Coding Agent)
The system must follow a deterministic multi-step agentic loop rather than a single RAG call:
Phase 1: Rule Extraction (The "Legal" Agent)
Input: PDF of a Credit Agreement.
Action: Use VultronRetrieverPrime to find the "Financial Covenants" section.
Output: A JSON object of rules (e.g., debt_to_ebitda_limit: 3.5, minimum_liquidity: 500M).
Phase 2: Planning (The "Auditor" Agent)
Action: Based on the rules, the agent plans which SEC filings to fetch and which line items are needed (e.g., "I need Total Debt from the Balance Sheet and Net Income from the Income Statement").
Phase 3: Multi-Step Retrieval (The "Data" Agent)
Action: Fetch the latest 10-Q/10-K for the target Ticker.
Tool Use: Use VultronRetriever to specifically target the Consolidated Financial Tables.
Verification: The agent must "Reason" if the table it found is the correct one (e.g., "This table is for the 3-month period ending Sept, not the 9-month period. I must look for the other table.").
Phase 4: Tool Execution (The "Calculator" Tool)
Action: Feed extracted numbers into a TypeScript calculation utility to compute the actual ratios.
Logic: Actual Ratio = Total Debt / EBITDA.
Phase 5: Decision & Citation (The "Reporter" Agent)
Action: Compare Actual vs Limit.
Outcome: Generate a "Compliance Memo" with exact page/paragraph citations for every number used.
📁 Project Structure
code
Text
/
├── apps/
│   ├── frontend/              # Vite + Shadcn + TanStack
│   │   ├── src/
│   │   │   ├── components/    # Shadcn UI components
│   │   │   ├── hooks/         # TanStack Query hooks
│   │   │   ├── routes/        # TanStack Router definitions
│   │   │   └── lib/           # Vultr API client wrappers
│   └── backend/               # TypeScript + Express
│       ├── src/
│       │   ├── agents/        # Logic for Planner, Auditor, Reporter
│       │   ├── tools/         # Math/Calculation tools
│       │   ├── services/      # SEC API & Vultr Inference connectors
│       │   └── index.ts
├── shared/                    # Shared Types/Interfaces
└── docs/                      # Sample 10-K PDFs and Credit Agreements
📝 Implementation Roadmap (Instructions for Coding Agent)
Step 1: Foundation
Initialize a monorepo or dual-folder structure.
Set up TanStack Router with two main views: Dashboard (List of monitored companies) and AuditView (The deep-dive agentic UI).
Configure the Vultr Serverless Inference client (OpenAI compatible).
Step 2: The Document Processor
Implement a PDF upload service in the backend that sends files to VultronRetriever.
Create an "Extraction" prompt for VultronRetrieverPrime-Qwen3.5-8B to convert unstructured legal text into a structured JSON "Covenant Rulebook."
Step 3: SEC Integration
Implement a service to fetch SEC filing URLs for a given ticker.
Use the Vultr Inference model to "Plan" which sections of the SEC filing need to be retrieved.
Step 4: The Agent Loop (The Hard Part)
Create an AgentEngine class in the backend.
It should maintain a history of thoughts (e.g., thought: "I found the debt table, but the interest expense is missing. Searching 'Note 7' now...").
CRITICAL: Ensure the backend streams these "thoughts" to the frontend via Server-Sent Events (SSE) or WebSockets so the user sees the agent "working."
Step 5: UI/UX
Build a "Thought Trace" component in the frontend using Shadcn's ScrollArea.
Build a "Comparison Card" that shows Rule vs Actual with a Red/Green status indicator.
Add a "Source Document" viewer that highlights where the data came from.
🛠️ Environment Variables
code
Env
VULTR_API_KEY=your_key_here
VULTR_INFERENCE_URL=https://api.vultr.com/v1/inference/...
SEC_API_KEY=your_sec_api_key
🎯 Success Criteria for the Hackathon
Multi-step: The agent must make at least 3 distinct "reasoning" calls to the LLM (Plan -> Retrieve -> Decide).
Layout-Aware: The system must successfully extract data from a complex financial table in a PDF.
Auditability: Every number in the final report must be linked to a specific retrieval block.
🤖 Context for AI Coding Agent
"When building the backend agents, always use the VultronRetrieverPrime-Qwen3.5-8B model for reasoning. Ensure that for every retrieval step, the agent explains why it is searching for that specific data. In the frontend, use TanStack Query for all API calls to the backend and TanStack Router for navigation between 'Upload' and 'Results' states."
# Vultr-Audit Backend

Minimal TypeScript/Bun backend for the Vultr-Audit pivot.

This folder now keeps only the reusable backend reference points needed by the root README plan:

- Elysia HTTP server and CORS setup.
- Root `.env` loading.
- Vultr OpenAI-compatible chat client.
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

The service reads the root `.env` file for Vultr settings. When `VULTR_API_KEY` is set and `VULTR_DEMO_MODE` is not true, reasoning calls use the configured Vultr inference endpoint. Without a live key, deterministic placeholders keep the backend usable during local development.

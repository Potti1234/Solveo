# Dokploy Deployment

This repo now deploys with the root `docker-compose.yml`.

## Dokploy app

1. Create a new Dokploy application from the GitHub repository.
2. Use Docker Compose as the deployment type.
3. Set the compose file path to:

```text
docker-compose.yml
```

4. Route the domain to the `frontend` service on internal port `80`.
5. Point your domain to the frontend service. Example:

```text
https://solveo.example.com -> frontend:80
```

The frontend calls `/api/...` on the same domain, and Nginx proxies those requests to the backend container.
SearXNG is not deployed by this Compose file; point `SEARXNG_BASE_URL` at your existing SearXNG instance.

## Required environment variables

Set these in Dokploy's environment variables for the app:

```bash
VITE_API_URL=
CORS_ORIGINS=https://solveo.example.com

VULTR_API_KEY=your_vultr_serverless_inference_key
VULTR_INFERENCE_URL=https://api.vultrinference.com/v1
VULTR_REASONING_MODEL=deepseek-ai/DeepSeek-V4-Flash
VULTR_RETRIEVER_MODEL=vultr/VultronRetrieverPrime-Qwen3.5-8B
VULTR_RETRIEVER_PRIME_MODEL=vultr/VultronRetrieverPrime-Qwen3.5-8B
VULTR_RETRIEVER_CORE_MODEL=vultr/VultronRetrieverCore-Qwen3.5-4.5B
VULTR_RETRIEVER_FLASH_MODEL=vultr/VultronRetrieverFlash-Qwen3.5-0.8B
VULTR_LOCAL_MODE=false
VULTR_TIMEOUT_SECONDS=8000
VULTR_RETRIEVER_MAX_DOCUMENT_CHARS=240000
VULTR_RETRIEVER_CHUNK_CHARS=12000

SEC_API_KEY=your_sec_api_key
SEC_USER_AGENT=Solveo (your-email@example.com)

WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=https://your-existing-searxng.example.com

ENABLE_VECTOR_INDEXING=false
ENABLE_DIRECT_LLM_EXTRACTION=false
ENABLE_SLOW_COVENANT_RAG=false
ENABLE_COVENANT_REFINEMENT=false
ENABLE_HEADROOM_TREND_SCAN=false
ENABLE_AMENDMENT_COMPARISON_SCAN=false
CODE_EXECUTION_TIMEOUT_MS=8000
CODE_EXECUTION_MAX_CODE_BYTES=30000
CODE_EXECUTION_MAX_OUTPUT_BYTES=20000
```

## Persistent data

The backend SQLite database is stored in the Docker volume `backend-data` at:

```text
/data/vultr_audit.db
```

Do not set `DATABASE_PATH` in Dokploy unless you intentionally want to override that path.

## Health check

After deployment, check:

```text
https://solveo.example.com/api/health
```

It should return:

```json
{"status":"ok"}
```
